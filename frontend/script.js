class PDFToWordConverter {
    constructor() {
        this.uploadArea = document.getElementById('uploadArea');
        this.progressArea = document.getElementById('progressArea');
        this.resultArea = document.getElementById('resultArea');
        this.errorArea = document.getElementById('errorArea');
        this.fileInput = document.getElementById('fileInput');
        this.progress = document.getElementById('progress');
        this.progressText = document.getElementById('progressText');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.newFileBtn = document.getElementById('newFileBtn');
        this.errorMessage = document.getElementById('errorMessage');
        this.loadingAnimation = document.getElementById('loadingAnimation');
        this.reptile = document.getElementById('reptile');
        
        // YOUR EXACT BACKEND URL
        this.backendUrl = 'https://pdf2word-4hoo.onrender.com';
        
        this.initEventListeners();
        this.initReptile();
        this.testBackendConnection();
    }

    initReptile() {
        // Reptile cursor follower
        document.addEventListener('mousemove', (e) => {
            if (window.innerWidth > 768) { // Only show on desktop
                const x = e.clientX;
                const y = e.clientY;
                
                // Smooth follow with delay
                setTimeout(() => {
                    this.reptile.style.left = x + 'px';
                    this.reptile.style.top = y + 'px';
                    
                    // Add bounce effect when moving
                    this.reptile.style.transform = `translate(-50%, -50%) scale(1.1)`;
                    setTimeout(() => {
                        this.reptile.style.transform = `translate(-50%, -50%) scale(1)`;
                    }, 100);
                }, 50);
            }
        });

        // Hide reptile when mouse leaves window
        document.addEventListener('mouseleave', () => {
            this.reptile.style.opacity = '0';
        });

        document.addEventListener('mouseenter', () => {
            this.reptile.style.opacity = '1';
        });
    }

    async testBackendConnection() {
        try {
            console.log('Testing connection to:', this.backendUrl);
            const response = await fetch(`${this.backendUrl}/health`);
            const data = await response.json();
            console.log('Backend connection successful:', data);
        } catch (error) {
            console.error('Backend connection failed:', error);
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

        // New file button
        this.newFileBtn.addEventListener('click', () => {
            this.resetToUpload();
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
            this.progressText.textContent = 'Uploading PDF...';
            
            console.log('Sending conversion request to:', `${this.backendUrl}/convert`);
            
            // Show loading animation
            this.showLoadingAnimation();
            
            const response = await fetch(`${this.backendUrl}/convert`, {
                method: 'POST',
                body: formData
            });

            console.log('Response status:', response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Server response error:', errorText);
                throw new Error(`Conversion failed (${response.status})`);
            }

            const result = await response.json();
            console.log('Conversion successful:', result);

            if (!result.success) {
                throw new Error(result.error || 'Conversion failed');
            }

            // Hide loading animation and show success
            this.hideLoadingAnimation();
            this.showResult(result.file_id, result.filename, result.original_filename);

        } catch (error) {
            this.hideLoadingAnimation();
            console.error('Conversion error:', error);
            this.showError(error.message || 'Conversion failed. Please try again.');
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
                this.progressText.textContent = 'Converting PDF to Word...';
            } else {
                width += Math.random() * 15;
                this.progress.style.width = Math.min(width, 85) + '%';
            }
        }, 300);
    }

    showLoadingAnimation() {
        this.loadingAnimation.classList.add('show');
    }

    hideLoadingAnimation() {
        this.loadingAnimation.classList.remove('show');
    }

    showResult(fileId, filename, originalFilename) {
        this.progressArea.style.display = 'none';
        this.resultArea.style.display = 'block';
        this.fileId = fileId;
        this.convertedFilename = filename;
        
        // Create a proper filename for download
        this.downloadFilename = originalFilename || 'converted_document.docx';
        
        this.progress.style.width = '100%';
        console.log('Ready for download - File ID:', this.fileId);
        
        // Add celebration effect
        this.celebrate();
    }

    celebrate() {
        // Add some celebration effects
        const container = document.querySelector('.container');
        container.style.animation = 'celebrate 0.5s ease';
        
        setTimeout(() => {
            container.style.animation = '';
        }, 500);
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
            console.log('Download URL:', `${this.backendUrl}/download/${this.fileId}`);
            
            const response = await fetch(`${this.backendUrl}/download/${this.fileId}`);
            
            console.log('Download response status:', response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Download error response:', errorText);
                throw new Error('Download failed - file may have expired');
            }

            // Get the file as blob
            const blob = await response.blob();
            console.log('Received file blob:', blob.size, 'bytes', blob.type);
            
            if (blob.size === 0) {
                throw new Error('Downloaded file is empty');
            }
            
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
            
            // Show download success effect
            this.showDownloadSuccess();

        } catch (error) {
            console.error('Download error:', error);
            this.showError('Download failed: ' + error.message);
        } finally {
            this.downloadBtn.textContent = 'Download Word Document';
            this.downloadBtn.disabled = false;
        }
    }

    showDownloadSuccess() {
        // Add download success animation
        this.downloadBtn.style.background = 'linear-gradient(135deg, #27ae60, #229954)';
        this.downloadBtn.textContent = '✓ Downloaded!';
        
        setTimeout(() => {
            this.downloadBtn.style.background = 'linear-gradient(135deg, #2ecc71, #27ae60)';
            this.downloadBtn.textContent = 'Download Word Document';
        }, 2000);
    }

    resetToUpload() {
        // Reset everything to initial state
        this.uploadArea.style.display = 'block';
        this.progressArea.style.display = 'none';
        this.resultArea.style.display = 'none';
        this.errorArea.style.display = 'none';
        
        this.fileInput.value = '';
        this.progress.style.width = '0%';
        this.progressText.textContent = 'Uploading...';
        
        // Add reset animation
        this.uploadArea.style.animation = 'fadeIn 0.5s ease';
        setTimeout(() => {
            this.uploadArea.style.animation = '';
        }, 500);
    }

    showError(message) {
        this.uploadArea.style.display = 'block';
        this.progressArea.style.display = 'none';
        this.resultArea.style.display = 'none';
        this.errorArea.style.display = 'block';
        this.errorMessage.textContent = message;
        console.error('Error:', message);
        
        // Add error shake effect
        this.errorArea.style.animation = 'shake 0.5s ease-in-out';
        setTimeout(() => {
            this.errorArea.style.animation = '';
        }, 500);
    }
}

function resetConverter() {
    location.reload();
}

// Add celebrate animation to CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes celebrate {
        0% { transform: scale(1); }
        50% { transform: scale(1.02); }
        100% { transform: scale(1); }
    }
`;
document.head.appendChild(style);

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    new PDFToWordConverter();
});
