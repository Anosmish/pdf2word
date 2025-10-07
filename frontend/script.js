class PDFToWordConverter {
    constructor() {
        this.uploadArea = document.getElementById('uploadArea');
        this.progressArea = document.getElementById('progressArea');
        this.resultArea = document.getElementById('resultArea');
        this.errorArea = document.getElementById('errorArea');
        this.fileInput = document.getElementById('fileInput');
        this.progress = document.getElementById('progress');
        this.status = document.getElementById('status');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.errorMessage = document.getElementById('errorMessage');
        
        // Update with your Render backend URL
        this.backendUrl = 'https://pdf2word-4hoo.onrender.com';
        
        this.initEventListeners();
    }

    initEventListeners() {
        // File input change
        this.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFile(e.target.files[0]);
            }
        });

        // Drag and drop
        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadArea.classList.add('dragover');
        });

        this.uploadArea.addEventListener('dragleave', () => {
            this.uploadArea.classList.remove('dragover');
        });

        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadArea.classList.remove('dragover');
            
            if (e.dataTransfer.files.length > 0) {
                this.handleFile(e.dataTransfer.files[0]);
            }
        });

        // Click on upload area
        this.uploadArea.addEventListener('click', () => {
            this.fileInput.click();
        });

        // Download button
        this.downloadBtn.addEventListener('click', () => {
            this.downloadConvertedFile();
        });
    }

    handleFile(file) {
        // Validate file type
        if (file.type !== 'application/pdf') {
            this.showError('Please select a PDF file');
            return;
        }

        // Validate file size (20MB)
        if (file.size > 20 * 1024 * 1024) {
            this.showError('File size must be less than 20MB');
            return;
        }

        this.convertFile(file);
    }

    async convertFile(file) {
        this.showProgress();
        
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`${this.backendUrl}/convert`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Conversion failed');
            }

            this.showResult(result.file_id, result.filename, result.original_filename);

        } catch (error) {
            this.showError(error.message);
        }
    }

    showProgress() {
        this.uploadArea.style.display = 'none';
        this.progressArea.style.display = 'block';
        this.resultArea.style.display = 'none';
        this.errorArea.style.display = 'none';
        
        // Simulate progress animation
        let width = 0;
        const interval = setInterval(() => {
            if (width >= 90) {
                clearInterval(interval);
            } else {
                width += Math.random() * 10;
                this.progress.style.width = Math.min(width, 90) + '%';
            }
        }, 200);
    }

    showResult(fileId, filename, originalFilename) {
        this.progressArea.style.display = 'none';
        this.resultArea.style.display = 'block';
        this.fileId = fileId;
        this.convertedFilename = filename;
        this.originalFilename = originalFilename;
        this.progress.style.width = '100%';
    }

    async downloadConvertedFile() {
        if (this.fileId && this.convertedFilename) {
            try {
                this.downloadBtn.textContent = 'Downloading...';
                this.downloadBtn.disabled = true;

                const response = await fetch(
                    `${this.backendUrl}/download/${this.fileId}/${this.convertedFilename}`
                );
                
                if (!response.ok) {
                    throw new Error('Download failed');
                }

                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = this.originalFilename || 'converted.docx';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);

                // Files will be automatically cleaned up by the backend

            } catch (error) {
                this.showError('Download failed. Please try again.');
            } finally {
                this.downloadBtn.textContent = 'Download Word Document';
                this.downloadBtn.disabled = false;
            }
        }
    }

    showError(message) {
        this.uploadArea.style.display = 'block';
        this.progressArea.style.display = 'none';
        this.resultArea.style.display = 'none';
        this.errorArea.style.display = 'block';
        this.errorMessage.textContent = message;
    }
}

function resetConverter() {
    const converter = new PDFToWordConverter();
    converter.fileInput.value = '';
}

// Initialize the converter when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new PDFToWordConverter();
});
