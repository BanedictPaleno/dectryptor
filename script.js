// Глобальные переменные для хранения файлов
let selectedFiles = [];
let decryptedFiles = [];
let extractedLinks = [];

/**
 * Форматирует размер файла в читаемый вид
 * @param {number} bytes - размер файла в байтах
 * @returns {string} - отформатированный размер файла
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Определяет иконку для файла по его типу
 * @param {string} fileName - имя файла
 * @returns {string} - эмодзи иконка
 */
function getFileIcon(fileName) {
    const extension = fileName.split('.').pop()?.toLowerCase();
    const iconMap = {
        'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️', 'bmp': '🖼️', 'webp': '🖼️',
        'pdf': '📄', 'doc': '📄', 'docx': '📄', 'txt': '📄',
        'zip': '📦', 'rar': '📦', '7z': '📦',
        'mp4': '🎥', 'avi': '🎥', 'mov': '🎥',
        'mp3': '🎵', 'wav': '🎵', 'flac': '🎵'
    };
    return iconMap[extension] || '📁';
}

/**
 * Создает уникальный ID для файла
 * @param {File} file - файл
 * @returns {string} - уникальный ID
 */
function generateFileId(file) {
    return `${file.name}_${file.size}_${file.lastModified}`;
}

/**
 * Расшифровывает имя файла для извлечения даты и ссылки
 * @param {string} filename - имя файла
 * @param {string} password - пароль для расшифровки
 * @returns {Object} - объект с датой и ссылкой
 */
function decryptFilename(filename, password) {
    try {
        // Убираем расширение
        const baseName = filename.replace(/\.[^/.]+$/, "");
        
        try {
            // Декодируем из base64
            const encryptedData = atob(baseName);
            
            // XOR расшифровка
            const passwordBytes = new TextEncoder().encode(password || 'default_password');
            const decryptedBytes = new Uint8Array(encryptedData.length);
            
            for (let i = 0; i < encryptedData.length; i++) {
                decryptedBytes[i] = encryptedData.charCodeAt(i) ^ passwordBytes[i % passwordBytes.length];
            }
            
            const decryptedString = new TextDecoder().decode(decryptedBytes);
            
            // Разделяем по разделителю |
            if (decryptedString.includes('|')) {
                const [dateTime, link] = decryptedString.split('|', 2);
                return {
                    dateTime: dateTime,
                    link: link !== 'null' ? link : null,
                    success: true
                };
            }
        } catch (decryptError) {
            console.log('Ошибка расшифровки base64, проверяем формат с датой:', decryptError.message);
        }

        // Если расшифровка не удалась, проверяем формат YYYYMMDD_HHMMSS_link
        if (baseName.length >= 15 && baseName[8] === '_' && baseName[15] === '_') {
            const datePart = baseName.substring(0, 8);
            const timePart = baseName.substring(9, 15);
            
            if (/^\d{8}$/.test(datePart) && /^\d{6}$/.test(timePart)) {
                const linkPart = baseName.substring(16);
                
                if (linkPart) {
                    // Восстанавливаем ссылку
                    let restoredLink = linkPart.replace(/_/g, '/');
                    
                    if (!restoredLink.startsWith('http://') && !restoredLink.startsWith('https://')) {
                        restoredLink = 'https://' + restoredLink;
                    }
                    
                    return {
                        dateTime: `${datePart}_${timePart}`,
                        link: restoredLink,
                        success: true
                    };
                } else {
                    return {
                        dateTime: `${datePart}_${timePart}`,
                        link: null,
                        success: true
                    };
                }
            }
        }
        
        return { dateTime: null, link: null, success: false };
        
    } catch (error) {
        console.log('Общая ошибка расшифровки имени файла:', error);
        return { dateTime: null, link: null, success: false };
    }
}

/**
 * Проверяет наличие маркера шифрования ENC_ в файле
 * @param {ArrayBuffer} fileData - данные файла
 * @returns {boolean} - true если файл зашифрован
 */
function checkEncryptionMarker(fileData) {
    const header = new Uint8Array(fileData.slice(0, 4));
    const marker = [0x45, 0x4E, 0x43, 0x5F]; // "ENC_"
    return header.every((byte, index) => byte === marker[index]);
}

/**
 * Создает ключ шифрования из пароля
 * @param {string} password - пароль
 * @returns {Promise<ArrayBuffer>} - ключ SHA-256
 */
async function generateKey(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    return await crypto.subtle.digest('SHA-256', data);
}

/**
 * Расшифровывает файл используя AES-CTR
 * @param {ArrayBuffer} encryptedData - зашифрованные данные
 * @param {ArrayBuffer} key - ключ шифрования
 * @returns {Promise<ArrayBuffer>} - расшифрованные данные
 */
async function decryptFileData(encryptedData, key) {
    if (encryptedData.byteLength < 20) {
        throw new Error('Файл слишком мал');
    }

    // Проверяем маркер ENC_
    if (!checkEncryptionMarker(encryptedData)) {
        throw new Error('Неверный маркер шифрования');
    }

    // Извлекаем IV (16 байт после маркера)
    const iv = encryptedData.slice(4, 20);
    const encryptedContent = encryptedData.slice(20);

    if (encryptedContent.byteLength === 0) {
        throw new Error('Нет зашифрованного содержимого');
    }

    // Импортируем ключ
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'AES-CTR' },
        false,
        ['decrypt']
    );

    // Создаем IV для AES-CTR
    const ivArray = new Uint8Array(iv);
    const ivPrefix = ivArray.slice(0, 8);
    const ivCounterBytes = ivArray.slice(8, 16);
    
    // Читаем counter как big-endian 64-bit число
    let counterValue = 0;
    for (let i = 0; i < 8; i++) {
        counterValue = (counterValue * 256) + ivCounterBytes[i];
    }

    // Создаем 128-битный IV для AES-CTR
    const fullIV = new Uint8Array(16);
    fullIV.set(ivPrefix, 0);
    
    // Записываем counter как big-endian 64-bit число в младшие 8 байт
    for (let i = 7; i >= 0; i--) {
        fullIV[8 + i] = counterValue & 0xFF;
        counterValue = Math.floor(counterValue / 256);
    }

    // Расшифровываем
    const decrypted = await crypto.subtle.decrypt(
        {
            name: 'AES-CTR',
            counter: fullIV,
            length: 128
        },
        cryptoKey,
        encryptedContent
    );

    return decrypted;
}

/**
 * Определяет тип файла по заголовку
 * @param {ArrayBuffer} data - данные файла
 * @returns {Object} - информация о типе файла
 */
function detectFileType(data) {
    const header = new Uint8Array(data.slice(0, 16));
    
    const fileTypes = [
        { signature: [0xFF, 0xD8], ext: 'jpg', mime: 'image/jpeg', type: 'JPEG' },
        { signature: [0x89, 0x50, 0x4E, 0x47], ext: 'png', mime: 'image/png', type: 'PNG' },
        { signature: [0x42, 0x4D], ext: 'bmp', mime: 'image/bmp', type: 'BMP' },
        { signature: [0x52, 0x49, 0x46, 0x46], ext: 'webp', mime: 'image/webp', type: 'WEBP' },
        { signature: [0x47, 0x49, 0x46, 0x38], ext: 'gif', mime: 'image/gif', type: 'GIF' }
    ];

    for (const fileType of fileTypes) {
        if (header.slice(0, fileType.signature.length).every((byte, i) => byte === fileType.signature[i])) {
            return {
                ext: fileType.ext,
                mime: fileType.mime,
                type: fileType.type,
                isValid: true
            };
        }
    }

    return { ext: 'bin', mime: 'application/octet-stream', type: 'Unknown', isValid: false };
}

/**
 * Создает карточку файла в интерфейсе
 * @param {File} file - файл для отображения
 * @returns {HTMLElement} - элемент карточки файла
 */
function createFileCard(file) {
    const fileId = generateFileId(file);
    const fileCard = document.createElement('div');
    fileCard.className = 'file-card';
    fileCard.dataset.fileId = fileId;
    
    // Анализируем имя файла
    const password = document.getElementById('password').value || 'default_password';
    const filenameInfo = decryptFilename(file.name, password);
    
    // Проверяем на маркер шифрования (читаем первые 4 байта)
    const reader = new FileReader();
    reader.onload = function(e) {
        const isEncrypted = checkEncryptionMarker(e.target.result);
        const encryptedIndicator = fileCard.querySelector('.encrypted-indicator');
        if (encryptedIndicator) {
            encryptedIndicator.textContent = isEncrypted ? '🔒 Зашифрован' : '📂 Не зашифрован';
            encryptedIndicator.className = `encrypted-indicator ${isEncrypted ? 'yes' : 'no'}`;
        }
    };
    reader.readAsArrayBuffer(file.slice(0, 4));
    
    fileCard.innerHTML = `
        <div class="file-card-header">
            <div style="display: flex; align-items: flex-start;">
                <div class="file-icon">${getFileIcon(file.name)}</div>
                <div class="file-info">
                    <div class="file-name" title="${file.name}">${file.name}</div>
                    <div class="file-size">${formatFileSize(file.size)}</div>
                </div>
            </div>
            <button class="file-remove" onclick="removeFile('${fileId}')" title="Удалить файл">×</button>
        </div>
        
        <div class="file-details">
            ${filenameInfo.dateTime ? `
                <div class="file-detail-item">
                    <span class="file-detail-label">Дата:</span>
                    <span class="file-detail-value">${filenameInfo.dateTime}</span>
                </div>
            ` : ''}
            ${filenameInfo.link ? `
                <div class="file-detail-item">
                    <span class="file-detail-label">Ссылка:</span>
                    <span class="file-detail-value link" onclick="window.open('${filenameInfo.link}', '_blank')" title="Открыть ссылку">${filenameInfo.link}</span>
                </div>
            ` : ''}
            <div class="encrypted-indicator">Проверка...</div>
        </div>
        
        <div class="file-status ready">Готов к обработке</div>
        <div class="file-progress" id="progress_${fileId}">
            <div class="file-progress-bar"></div>
        </div>
    `;
    
    return fileCard;
}

/**
 * Обновляет отображение файлов в интерфейсе
 */
function updateFilesDisplay() {
    const filesGrid = document.getElementById('files-grid');
    const filesCounter = document.querySelector('.files-counter');
    
    // Очищаем сетку файлов
    filesGrid.innerHTML = '';
    
    if (selectedFiles.length === 0) {
        filesCounter?.classList.remove('show');
        return;
    }
    
    // Создаем карточки для каждого файла
    selectedFiles.forEach(file => {
        const fileCard = createFileCard(file);
        filesGrid.appendChild(fileCard);
    });
    
    // Показываем счетчик файлов
    if (!filesCounter) {
        createFilesCounter();
    } else {
        updateFilesCounter();
        filesCounter.classList.add('show');
    }
}

/**
 * Создает счетчик файлов
 */
function createFilesCounter() {
    const filesGrid = document.getElementById('files-grid');
    const counter = document.createElement('div');
    counter.className = 'files-counter show';
    counter.innerHTML = `
        <span class="files-counter-text">Выбрано файлов: ${selectedFiles.length}</span>
        <button class="clear-all-btn" onclick="clearAllFiles()">Очистить все</button>
    `;
    filesGrid.parentNode.insertBefore(counter, filesGrid);
}

/**
 * Обновляет счетчик файлов
 */
function updateFilesCounter() {
    const counterText = document.querySelector('.files-counter-text');
    if (counterText) {
        counterText.textContent = `Выбрано файлов: ${selectedFiles.length}`;
    }
}

/**
 * Удаляет файл из списка
 * @param {string} fileId - ID файла для удаления
 */
function removeFile(fileId) {
    const fileCard = document.querySelector(`[data-file-id="${fileId}"]`);
    if (fileCard) {
        fileCard.classList.add('removing');
        setTimeout(() => {
            // Удаляем файл из массива
            selectedFiles = selectedFiles.filter(file => generateFileId(file) !== fileId);
            // Обновляем отображение
            updateFilesDisplay();
        }, 300);
    }
}

/**
 * Очищает все выбранные файлы
 */
function clearAllFiles() {
    selectedFiles = [];
    decryptedFiles = [];
    extractedLinks = [];
    updateFilesDisplay();
    updateLinksPanel();
    
    // Очищаем поле ввода файлов
    document.getElementById('file-upload').value = '';
    
    // Скрываем результаты
    const statusDiv = document.getElementById('status');
    const downloadSection = document.getElementById('download-section');
    statusDiv.style.display = 'none';
    document.getElementById('downloadAll').style.display = 'none';
    document.getElementById('download-links').innerHTML = '';
}

/**
 * Добавляет файлы в список (избегает дублирование)
 * @param {FileList|File[]} files - файлы для добавления
 */
function addFiles(files) {
    const newFiles = Array.from(files);
    
    newFiles.forEach(newFile => {
        const newFileId = generateFileId(newFile);
        // Проверяем, нет ли уже такого файла
        const exists = selectedFiles.some(existingFile => 
            generateFileId(existingFile) === newFileId
        );
        
        if (!exists) {
            selectedFiles.push(newFile);
        }
    });
    
    updateFilesDisplay();
}

/**
 * Инициализация drag & drop функциональности
 */
function initializeDragAndDrop() {
    const dropZone = document.getElementById('drop-zone');
    
    // Предотвращаем стандартное поведение браузера
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    
    // Подсветка при перетаскивании
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });
    
    // Обработка сброса файлов
    dropZone.addEventListener('drop', handleDrop, false);
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    function highlight(e) {
        dropZone.classList.add('drag-over');
    }
    
    function unhighlight(e) {
        dropZone.classList.remove('drag-over');
    }
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        addFiles(files);
    }
}

/**
 * Обработчик события выбора файлов через кнопку
 */
document.getElementById('file-upload').addEventListener('change', function(e) {
    addFiles(e.target.files);
});

/**
 * Обновляет статус файла в карточке
 * @param {string} fileId - ID файла
 * @param {string} status - новый статус ('ready', 'processing', 'success', 'error')
 * @param {string} message - сообщение статуса
 */
function updateFileStatus(fileId, status, message = '') {
    const fileCard = document.querySelector(`[data-file-id="${fileId}"]`);
    if (!fileCard) return;
    
    const statusElement = fileCard.querySelector('.file-status');
    const progressElement = fileCard.querySelector('.file-progress');
    
    statusElement.className = `file-status ${status}`;
    
    const statusMessages = {
        'ready': 'Готов к обработке',
        'processing': 'Обрабатывается...',
        'success': message || 'Успешно обработан',
        'error': message || 'Ошибка'
    };
    
    statusElement.textContent = statusMessages[status] || message;
    
    if (status === 'processing') {
        progressElement.classList.add('show');
        const progressBar = progressElement.querySelector('.file-progress-bar');
        progressBar.style.width = '100%';
    } else {
        progressElement.classList.remove('show');
    }
}

/**
 * Обновляет панель ссылок
 */
function updateLinksPanel() {
    const linksPanel = document.getElementById('links-panel');
    const linksContainer = document.getElementById('links-container');
    
    if (extractedLinks.length === 0) {
        linksPanel.style.display = 'none';
        return;
    }
    
    linksContainer.innerHTML = '';
    extractedLinks.forEach((linkInfo, index) => {
        const linkItem = document.createElement('div');
        linkItem.className = 'link-item';
        linkItem.innerHTML = `
            <div class="link-header">
                <div class="link-filename">${linkInfo.filename}</div>
                <div class="link-date">${linkInfo.dateTime || 'Дата не найдена'}</div>
            </div>
            <div style="display: flex; align-items: center;">
                <a href="${linkInfo.link}" target="_blank" class="link-url" title="Открыть ссылку">${linkInfo.link}</a>
                <button class="copy-link-btn" onclick="copyLink('${linkInfo.link}')" title="Скопировать ссылку">📋</button>
            </div>
        `;
        linksContainer.appendChild(linkItem);
    });
    
    linksPanel.style.display = 'block';
}

/**
 * Копирует отдельную ссылку в буфер обмена
 * @param {string} link - ссылка для копирования
 */
function copyLink(link) {
    navigator.clipboard.writeText(link).then(() => {
        // Показываем временное уведомление
        const notification = document.createElement('div');
        notification.textContent = 'Ссылка скопирована!';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(76, 175, 80, 0.9);
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            z-index: 10000;
            font-weight: 500;
        `;
        document.body.appendChild(notification);
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 2000);
    }).catch(err => {
        console.error('Ошибка копирования:', err);
    });
}

/**
 * Копирует все ссылки в буфер обмена
 */
function copyAllLinks() {
    if (extractedLinks.length === 0) return;
    
    const allLinks = extractedLinks.map(linkInfo => 
        `${linkInfo.filename} (${linkInfo.dateTime || 'Без даты'}): ${linkInfo.link}`
    ).join('\n');
    
    navigator.clipboard.writeText(allLinks).then(() => {
        // Показываем уведомление
        const notification = document.createElement('div');
        notification.textContent = `Скопировано ${extractedLinks.length} ссылок!`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(33, 150, 243, 0.9);
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            z-index: 10000;
            font-weight: 500;
        `;
        document.body.appendChild(notification);
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 3000);
    }).catch(err => {
        console.error('Ошибка копирования:', err);
    });
}

/**
 * Обрабатывает один файл
 * @param {File} file - файл для обработки
 * @param {ArrayBuffer} key - ключ шифрования
 * @param {HTMLElement} downloadLinks - контейнер для ссылок скачивания
 * @returns {Promise<Object>} - результат обработки
 */
async function processFile(file, key, downloadLinks) {
    try {
        const password = document.getElementById('password').value || 'default_password';
        
        // Анализируем имя файла
        const filenameInfo = decryptFilename(file.name, password);
        
        // Если найдена ссылка, добавляем её в список
        if (filenameInfo.link) {
            extractedLinks.push({
                filename: file.name,
                dateTime: filenameInfo.dateTime,
                link: filenameInfo.link
            });
        }
        
        // Читаем файл
        const fileData = await file.arrayBuffer();
        
        let decryptedData;
        let fileType;
        let isEncrypted = false;
        
        // Проверяем, зашифрован ли файл
        if (checkEncryptionMarker(fileData)) {
            isEncrypted = true;
            // Расшифровываем файл
            decryptedData = await decryptFileData(fileData, key);
            fileType = detectFileType(decryptedData);
            
            if (!fileType.isValid) {
                throw new Error('Неверный пароль или поврежденный файл');
            }
        } else {
            // Файл не зашифрован, работаем с ним как есть
            decryptedData = fileData;
            fileType = detectFileType(decryptedData);
        }
        
        // Создаем имя выходного файла
        let outputFileName;
        if (filenameInfo.dateTime) {
            // Используем расшифрованную дату как имя
            outputFileName = `${filenameInfo.dateTime.replace(/[:/\\*?"<>|]/g, '_')}.${fileType.ext}`;
        } else {
            // Используем оригинальное имя с правильным расширением
            const baseName = file.name.replace(/\.[^/.]+$/, '');
            outputFileName = `${baseName}_decrypted.${fileType.ext}`;
        }
        
        // Создаем ссылку для скачивания
        const blob = new Blob([decryptedData], { type: fileType.mime });
        const url = URL.createObjectURL(blob);
        
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = outputFileName;
        downloadLink.className = 'download-btn';
        downloadLink.textContent = `📥 ${file.name} → ${outputFileName}`;
        downloadLinks.appendChild(downloadLink);
        
        // Сохраняем информацию о файле для массового скачивания
        decryptedFiles.push({ url, name: outputFileName });
        
        return {
            success: true,
            fileType: fileType.type,
            isEncrypted: isEncrypted,
            outputFileName: outputFileName
        };
        
    } catch (error) {
        console.error('Ошибка обработки файла:', error);
        return {
            success: false,
            error: error.message,
            isEncrypted: false
        };
    }
}

/**
 * Основная функция расшифровки файлов
 */
async function decryptFiles() {
    // Получаем элементы интерфейса
    const passwordInput = document.getElementById('password');
    const statusDiv = document.getElementById('status');
    const downloadSection = document.getElementById('download-section');
    const downloadLinks = document.getElementById('download-links');
    const downloadAllBtn = document.getElementById('downloadAll');
    const loader = document.getElementById('loader');

    // Сбрасываем интерфейс
    statusDiv.textContent = '';
    statusDiv.className = 'status-message';
    downloadLinks.innerHTML = '';
    downloadAllBtn.style.display = 'none';
    loader.style.display = 'none';
    decryptedFiles = [];
    extractedLinks = [];

    // Проверяем, выбраны ли файлы
    if (selectedFiles.length === 0) {
        statusDiv.textContent = '❌ Выберите файлы для расшифровки.';
        statusDiv.className = 'status-message error';
        statusDiv.style.display = 'block';
        return;
    }

    // Получаем пароль
    const password = passwordInput.value || 'default_password';
    statusDiv.textContent = `🔄 Обрабатываем ${selectedFiles.length} файлов...`;
    statusDiv.className = 'status-message';
    statusDiv.style.display = 'block';
    loader.style.display = 'flex';

    try {
        // Создаем ключ шифрования
        const key = await generateKey(password);

        let successCount = 0;
        let errorCount = 0;
        let encryptedCount = 0;
        let unencryptedCount = 0;

        // Обрабатываем каждый файл
        for (const file of selectedFiles) {
            const fileId = generateFileId(file);
            updateFileStatus(fileId, 'processing');
            
            try {
                const result = await processFile(file, key, downloadLinks);
                if (result.success) {
                    updateFileStatus(fileId, 'success', `${result.fileType} файл: ${result.outputFileName}`);
                    successCount++;
                    if (result.isEncrypted) {
                        encryptedCount++;
                    } else {
                        unencryptedCount++;
                    }
                } else {
                    updateFileStatus(fileId, 'error', result.error);
                    errorCount++;
                }
            } catch (error) {
                updateFileStatus(fileId, 'error', error.message);
                errorCount++;
            }
        }

        // Обновляем панель ссылок
        updateLinksPanel();

        // Обновляем общий статус
        if (successCount > 0) {
            let statusText = `✅ Успешно обработано: ${successCount} файлов`;
            if (encryptedCount > 0) {
                statusText += `\n🔓 Расшифровано: ${encryptedCount} файлов`;
            }
            if (unencryptedCount > 0) {
                statusText += `\n📂 Обычных файлов: ${unencryptedCount}`;
            }
            if (extractedLinks.length > 0) {
                statusText += `\n🔗 Извлечено ссылок: ${extractedLinks.length}`;
            }
            if (errorCount > 0) {
                statusText += `\n⚠️ Ошибок: ${errorCount} файлов`;
            }
            statusDiv.textContent = statusText;
            statusDiv.className = 'status-message success';
            downloadAllBtn.style.display = 'inline-block';
        } else {
            statusDiv.textContent = `❌ Не удалось обработать ни одного файла. Проверьте пароль и файлы.`;
            statusDiv.className = 'status-message error';
        }

    } catch (e) {
        statusDiv.textContent = `❌ Общая ошибка: ${e.message}`;
        statusDiv.className = 'status-message error';
        
        // Помечаем все файлы как ошибочные
        selectedFiles.forEach(file => {
            const fileId = generateFileId(file);
            updateFileStatus(fileId, 'error', 'Ошибка ключа');
        });
    } finally {
        loader.style.display = 'none';
    }
}

/**
 * Скачивает все расшифрованные файлы
 * Автоматически запускает скачивание каждого файла
 */
function downloadAllFiles() {
    decryptedFiles.forEach((file, index) => {
        setTimeout(() => {
            const link = document.createElement('a');
            link.href = file.url;
            link.download = file.name;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }, index * 200); // Увеличенная задержка между скачиваниями
    });
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    initializeDragAndDrop();
    
    // Добавляем обработчик клика на зону перетаскивания
    const dropZone = document.getElementById('drop-zone');
    dropZone.addEventListener('click', function() {
        document.getElementById('file-upload').click();
    });
    
    // Добавляем обработчик для обновления карточек при изменении пароля
    const passwordInput = document.getElementById('password');
    passwordInput.addEventListener('input', function() {
        // Обновляем карточки файлов при изменении пароля
        if (selectedFiles.length > 0) {
            updateFilesDisplay();
        }
    });
});
