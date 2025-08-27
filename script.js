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
 * Обработчик события выбора файлов
 * Показывает информацию о выбранных файлах в интерфейсе
 */
document.getElementById('file-upload').addEventListener('change', function(e) {
    selectedFiles = Array.from(e.target.files);
    const fileList = document.getElementById('file-list');
    const fileInfo = document.getElementById('file-info');
    
    // Очищаем список файлов
    fileList.innerHTML = '';
    
    if (selectedFiles.length > 0) {
        // Показываем информацию о каждом файле
        selectedFiles.forEach(file => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <div class="file-name">${file.name}</div>
                <div class="file-size">${formatFileSize(file.size)}</div>
            `;
            fileList.appendChild(fileItem);
        });
        fileInfo.style.display = 'block';
    } else {
        fileInfo.style.display = 'none';
    }
});

/**
 * Основная функция расшифровки файлов
 * Обрабатывает все выбранные файлы и расшифровывает их
 */
async function decryptFiles() {
    // Получаем элементы интерфейса
    const fileInput = document.getElementById('file-upload');
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
    if (!fileInput.files.length) {
        statusDiv.textContent = '❌ Выберите файлы.';
        statusDiv.className = 'status-message error';
        statusDiv.style.display = 'block';
        return;
    }

    // Получаем пароль (или используем по умолчанию)
    const password = passwordInput.value || 'default_password';
    statusDiv.textContent = '🔄 Обработка файлов...';
    statusDiv.className = 'status-message';
    statusDiv.style.display = 'block';
    loader.style.display = 'flex';

    try {
        // Создаем ключ шифрования один раз для всех файлов
        const key = await generateDecryptionKey(password);

        // Обрабатываем каждый файл
        for (const file of selectedFiles) {
            await processFile(file, key, statusDiv, downloadLinks);
        }

        // Показываем кнопку "Скачать все", если есть расшифрованные файлы
        if (decryptedFiles.length > 0) {
            downloadAllBtn.style.display = 'inline-block';
            statusDiv.textContent += `\n💾 Все файлы готовы к скачиванию!`;
        } else {
            statusDiv.textContent += `\n❌ Не удалось расшифровать ни один файл.`;
        }

    } catch (e) {
        statusDiv.textContent = `❌ Общая ошибка: ${e.message}`;
        statusDiv.className = 'status-message error';
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
 * @param {HTMLElement} statusDiv - элемент для вывода статуса
 * @param {HTMLElement} downloadLinks - контейнер для ссылок скачивания
 */
async function processFile(file, key, statusDiv, downloadLinks) {
    try {
        // Читаем зашифрованные данные
        const encryptedData = await file.arrayBuffer();

        // Проверяем минимальный размер файла (должен содержать IV)
        if (encryptedData.byteLength < 16) {
            statusDiv.textContent += `\n❌ Файл ${file.name} слишком маленький.`;
            statusDiv.className = 'status-message error';
            return;
        }

        // Извлекаем вектор инициализации (первые 16 байт)
        const iv = encryptedData.slice(0, 16);
        const encryptedContent = encryptedData.slice(16);

        // Проверяем, есть ли зашифрованное содержимое
        if (encryptedContent.byteLength === 0) {
            statusDiv.textContent += `\n❌ Нет зашифрованного содержимого в ${file.name}.`;
            statusDiv.className = 'status-message error';
            return;
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
        
        // Обновляем статус
        if (fileInfo.type !== 'Неизвестный') {
            statusDiv.textContent += `\n✅ ${file.name}: Найден заголовок ${fileInfo.type}!`;
            statusDiv.className = 'status-message success';
        } else {
            statusDiv.textContent += `\n⚠️ ${file.name}: Неизвестный заголовок. Возможно, неверный пароль или поврежденный файл.`;
            statusDiv.className = 'status-message error';
        }

        // Создаем ссылку для скачивания
        createDownloadLink(file, decryptedData, fileInfo, downloadLinks);

        statusDiv.textContent += `\n💾 ${file.name}: Файл готов к скачиванию!`;

    } catch (e) {
        statusDiv.textContent += `\n❌ Ошибка при обработке ${file.name}: ${e.message}`;
        statusDiv.className = 'status-message error';
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
    downloadLink.textContent = `Скачать ${originalFile.name} (${fileInfo.type})`;
    downloadLinks.appendChild(downloadLink);

    // Сохраняем информацию о файле для массового скачивания
    decryptedFiles.push({ url, name: fileName });
}

/**
 * Скачивает все расшифрованные файлы
 * Автоматически запускает скачивание каждого файла
 */
function downloadAllFiles() {
    decryptedFiles.forEach(file => {
        const link = document.createElement('a');
        link.href = file.url;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
}
