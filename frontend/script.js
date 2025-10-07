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
        
        // UPDATE WITH YOUR RENDER BACKEND URL
        this.backendUrl = 'https://pdf2msword.netlify.app'; // ← UPDATE THIS
        
        this.initEventListeners();
        this.testBackendConnection();
    }

    async testBackendConnection() {
        try {
            const response = await fetch(`${this.backendUrl}/health`);
            if (response.ok) {
                console.log('Backend connection successful');
            } else {
                console.error('Backend connection failed');
            }
        } catch (error) {
            console.error('Cannot connect to backend:', error);
        }
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
        console.log('File selected:', file.name, file.type, file.size);
        
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

        if (file.size === 0) {
            this.showError('File is empty');
            return;
        }

        this.convertFile(file);
    }

    async convertFile(file) {
        this.showProgress();
        
        const formData = new FormData();
        formData.append('file', file);

        try {
            this.status.textContent = 'Uploading PDF...';
            
            const response = await fetch(`${this.backendUrl}/convert`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            console.log('Conversion response:', result);

            if (!response.ok) {
                throw new Error(result.error || `Conversion failed (${response.status})`);
            }

            this.showResult(result.file_id, result.filename, result.original_filename);

        } catch (error) {
            console.error('Conversion error:', error);
            this.showError(error.message);
        }
    }

    showProgress() {
        this.uploadArea.style.display = 'none';
        this.progressArea.style.display = 'block';
        this.resultArea.style.display = 'none';
        this.errorArea.style.display = 'none';
        
        // Animate progress bar
        let width = 0;
        const interval = setInterval(() => {
            if (width >= 85) {
                clearInterval(interval);
                this.status.textContent = 'Converting PDF to Word...';
            } else {
                width += Math.random() * 15;
                this.progress.style.width = Math.min(width, 85) + '%';
            }
        }, 300);
    }

    showResult(fileId, filename, originalFilename) {
        this.progressArea.style.display = 'none';
        this.resultArea.style.display = 'block';
        this.fileId = fileId;
        this.convertedFilename = filename;
        
        // Create a proper filename for download
        this.downloadFilename = originalFilename || 
                               'converted_document.docx';
        
        this.progress.style.width = '100%';
        console.log('Ready for download:', this.fileId, this.downloadFilename);
    }

    async downloadConvertedFile() {
        if (!this.fileId) {
            this.showError('No file to download');
            return;
        }

        try {
            this.downloadBtn.textContent = 'Downloading...';
            this.downloadBtn.disabled = true;

            console.log('Downloading file ID:', this.fileId);
            
            const response = await fetch(`${this.backendUrl}/download/${this.fileId}`);
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Download failed');
            }

            // Get the file as blob
            const blob = await response.blob();
            console.log('Received blob:', blob.size, 'bytes', blob.type);
            
            // Create download link
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = this.downloadFilename;
            
            // Trigger download
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Clean up
            window.URL.revokeObjectURL(url);
            
            console.log('Download completed successfully');

        } catch (error) {
            console.error('Download error:', error);
            this.showError('Download failed: ' + error.message);
        } finally {
            this.downloadBtn.textContent = 'Download Word Document';
            this.downloadBtn.disabled = false;
        }
    }

    showError(message) {
        this.uploadArea.style.display = 'block';
        this.progressArea.style.display = 'none';
        this.resultArea.style.display = 'none';
        this.errorArea.style.display = 'block';
        this.errorMessage.textContent = message;
        console.error('Error:', message);
    }
}

function resetConverter() {
    location.reload();
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    new PDFToWordConverter();
});
