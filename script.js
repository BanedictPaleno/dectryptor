// Глобальные переменные для хранения файлов
let selectedFiles = [];
let decryptedFiles = [];

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
 * Создает карточку файла в интерфейсе
 * @param {File} file - файл для отображения
 * @returns {HTMLElement} - элемент карточки файла
 */
function createFileCard(file) {
    const fileId = generateFileId(file);
    const fileCard = document.createElement('div');
    fileCard.className = 'file-card';
    fileCard.dataset.fileId = fileId;
    
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
    updateFilesDisplay();
    
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
        'success': message || 'Расшифрован',
        'error': message || 'Ошибка'
    };
    
    statusElement.textContent = statusMessages[status] || message;
    
    if (status === 'processing') {
        progressElement.classList.add('show');
        // Анимация прогресса
        const progressBar = progressElement.querySelector('.file-progress-bar');
        progressBar.style.width = '100%';
    } else {
        progressElement.classList.remove('show');
    }
}

/**
 * Основная функция расшифровки файлов
 * Обрабатывает все выбранные файлы и расшифровывает их
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

    // Проверяем, выбраны ли файлы
    if (selectedFiles.length === 0) {
        statusDiv.textContent = '❌ Выберите файлы для расшифровки.';
        statusDiv.className = 'status-message error';
        statusDiv.style.display = 'block';
        return;
    }

    // Получаем пароль (или используем по умолчанию)
    const password = passwordInput.value || 'default_password';
    statusDiv.textContent = `🔄 Обрабатываем ${selectedFiles.length} файлов...`;
    statusDiv.className = 'status-message';
    statusDiv.style.display = 'block';
    loader.style.display = 'flex';

    try {
        // Создаем ключ шифрования один раз для всех файлов
        const key = await generateDecryptionKey(password);

        let successCount = 0;
        let errorCount = 0;

        // Обрабатываем каждый файл
        for (const file of selectedFiles) {
            const fileId = generateFileId(file);
            updateFileStatus(fileId, 'processing');
            
            try {
                const result = await processFile(file, key, downloadLinks);
                if (result.success) {
                    updateFileStatus(fileId, 'success', `${result.fileType} файл`);
                    successCount++;
                } else {
                    updateFileStatus(fileId, 'error', result.error);
                    errorCount++;
                }
            } catch (error) {
                updateFileStatus(fileId, 'error', error.message);
                errorCount++;
            }
        }

        // Обновляем общий статус
        if (successCount > 0) {
            statusDiv.textContent = `✅ Успешно обработано: ${successCount} файлов`;
            if (errorCount > 0) {
                statusDiv.textContent += `\n⚠️ Ошибок: ${errorCount} файлов`;
            }
            statusDiv.className = 'status-message success';
            downloadAllBtn.style.display = 'inline-block';
        } else {
            statusDiv.textContent = `❌ Не удалось расшифровать ни одного файла. Проверьте пароль.`;
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
 * Создает ключ расшифровки из пароля
 * @param {string} password - пароль для расшифровки
 * @returns {Promise<CryptoKey>} - ключ для расшифровки
 */
async function generateDecryptionKey(password) {
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);
    const keyMaterial = await crypto.subtle.digest('SHA-256', passwordBuffer);
    
    return await crypto.subtle.importKey(
        'raw',
        keyMaterial,
        { name: 'AES-CTR' },
        false,
        ['decrypt']
    );
}

/**
 * Обрабатывает один файл - расшифровывает и создает ссылку для скачивания
 * @param {File} file - файл для обработки
 * @param {CryptoKey} key - ключ расшифровки
 * @param {HTMLElement} downloadLinks - контейнер для ссылок скачивания
 * @returns {Promise<Object>} - результат обработки
 */
async function processFile(file, key, downloadLinks) {
    try {
        // Читаем зашифрованные данные
        const encryptedData = await file.arrayBuffer();

        // Проверяем минимальный размер файла (должен содержать IV)
        if (encryptedData.byteLength < 16) {
            return { success: false, error: 'Файл слишком мал' };
        }

        // Извлекаем вектор инициализации (первые 16 байт)
        const iv = encryptedData.slice(0, 16);
        const encryptedContent = encryptedData.slice(16);

        // Проверяем, есть ли зашифрованное содержимое
        if (encryptedContent.byteLength === 0) {
            return { success: false, error: 'Пустой файл' };
        }

        // Расшифровываем файл
        const decryptedData = await crypto.subtle.decrypt(
            {
                name: 'AES-CTR',
                counter: iv,
                length: 128
            },
            key,
            encryptedContent
        );

        // Определяем тип файла по заголовку
        const fileInfo = detectFileType(new Uint8Array(decryptedData.slice(0, 4)));
        
        // Проверяем, является ли расшифрованный файл изображением
        if (fileInfo.type === 'Неизвестный') {
            return { success: false, error: 'Не изображение или неверный пароль' };
        }
        
        // Создаем ссылку для скачивания
        createDownloadLink(file, decryptedData, fileInfo, downloadLinks);

        return { 
            success: true, 
            fileType: fileInfo.type,
            extension: fileInfo.ext
        };

    } catch (e) {
        // Определяем тип ошибки для более понятного сообщения
        if (e.name === 'OperationError') {
            return { success: false, error: 'Неверный пароль' };
        }
        return { success: false, error: 'Поврежденный файл' };
    }
}

/**
 * Определяет тип файла по его заголовку
 * @param {Uint8Array} header - первые байты файла
 * @returns {Object} - объект с информацией о типе файла
 */
function detectFileType(header) {
    // Список известных заголовков файлов
    const validHeaders = [
        { bytes: [0xFF, 0xD8], ext: 'jpg', type: 'JPEG' },
        { bytes: [0x89, 0x50, 0x4E, 0x47], ext: 'png', type: 'PNG' },
        { bytes: [0x42, 0x4D], ext: 'bmp', type: 'BMP' },
        { bytes: [0x52, 0x49, 0x46, 0x46], ext: 'webp', type: 'WEBP' },
        { bytes: [0x47, 0x49, 0x46, 0x38], ext: 'gif', type: 'GIF' }
    ];

    // Проверяем каждый известный заголовок
    for (const { bytes, ext, type } of validHeaders) {
        if (header.slice(0, bytes.length).every((b, i) => b === bytes[i])) {
            return { ext, type };
        }
    }

    // Если заголовок не распознан
    return { ext: 'bin', type: 'Неизвестный' };
}

/**
 * Создает ссылку для скачивания расшифрованного файла
 * @param {File} originalFile - оригинальный файл
 * @param {ArrayBuffer} decryptedData - расшифрованные данные
 * @param {Object} fileInfo - информация о типе файла
 * @param {HTMLElement} downloadLinks - контейнер для ссылок
 */
function createDownloadLink(originalFile, decryptedData, fileInfo, downloadLinks) {
    // Создаем Blob с расшифрованными данными
    const blob = new Blob([decryptedData], { type: `image/${fileInfo.ext}` });
    const url = URL.createObjectURL(blob);
    
    // Формируем имя файла
    const originalName = originalFile.name.replace(/\.[^/.]+$/, "");
    const fileName = `${originalName}_decrypted.${fileInfo.ext}`;
    
    // Создаем ссылку для скачивания
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = fileName;
    downloadLink.className = 'download-btn';
    downloadLink.textContent = `📥 ${originalFile.name} (${fileInfo.type})`;
    downloadLinks.appendChild(downloadLink);

    // Сохраняем информацию о файле для массового скачивания
    decryptedFiles.push({ url, name: fileName });
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
        }, index * 100); // Небольшая задержка между скачиваниями
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
});
