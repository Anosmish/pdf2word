from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import uuid
from werkzeug.utils import secure_filename
import tempfile
from pdf2docx import Converter
import logging
from datetime import datetime
import threading
import time

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Configuration
app.config['MAX_CONTENT_LENGTH'] = 20 * 1024 * 1024  # 20MB limit
app.config['UPLOAD_FOLDER'] = tempfile.gettempdir()
app.config['CLEANUP_INTERVAL'] = 300  # 5 minutes
ALLOWED_EXTENSIONS = {'pdf'}

# Store file metadata for cleanup
file_registry = {}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def convert_pdf_to_docx(pdf_path, docx_path):
    """
    Convert PDF to DOCX while preserving formatting
    """
    try:
        cv = Converter(pdf_path)
        cv.convert(docx_path, start=0, end=None)
        cv.close()
        return True
    except Exception as e:
        logger.error(f"Conversion error: {str(e)}")
        return False

def cleanup_file(file_path):
    """
    Safely remove a file if it exists
    """
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            logger.info(f"Cleaned up file: {file_path}")
            return True
    except Exception as e:
        logger.error(f"Error cleaning up {file_path}: {str(e)}")
    return False

def cleanup_old_files():
    """
    Background thread to clean up files older than 1 hour
    """
    while True:
        try:
            current_time = datetime.now().timestamp()
            files_to_remove = []
            
            # Find files older than 1 hour
            for file_id, file_data in list(file_registry.items()):
                if current_time - file_data['created_time'] > 3600:  # 1 hour
                    files_to_remove.append(file_id)
            
            # Remove old files
            for file_id in files_to_remove:
                file_data = file_registry.pop(file_id, None)
                if file_data:
                    cleanup_file(file_data.get('pdf_path'))
                    cleanup_file(file_data.get('docx_path'))
                    logger.info(f"Auto-cleaned old file: {file_id}")
            
            time.sleep(app.config['CLEANUP_INTERVAL'])
            
        except Exception as e:
            logger.error(f"Cleanup thread error: {str(e)}")
            time.sleep(60)  # Wait 1 minute on error

def register_file(file_id, pdf_path, docx_path):
    """
    Register files for automatic cleanup
    """
    file_registry[file_id] = {
        'pdf_path': pdf_path,
        'docx_path': docx_path,
        'created_time': datetime.now().timestamp(),
        'downloaded': False
    }

def mark_file_downloaded(file_id):
    """
    Mark file as downloaded and schedule immediate cleanup
    """
    if file_id in file_registry:
        file_registry[file_id]['downloaded'] = True
        # Schedule cleanup after 30 seconds to ensure download completes
        threading.Timer(30.0, cleanup_file_immediately, args=[file_id]).start()

def cleanup_file_immediately(file_id):
    """
    Immediately clean up files for a specific file_id
    """
    file_data = file_registry.pop(file_id, None)
    if file_data:
        cleanup_file(file_data.get('pdf_path'))
        cleanup_file(file_data.get('docx_path'))
        logger.info(f"Immediately cleaned up: {file_id}")

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy', 
        'timestamp': datetime.utcnow().isoformat(),
        'files_tracked': len(file_registry)
    })

@app.route('/convert', methods=['POST'])
def convert_pdf():
    """
    Convert PDF to Word document
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': 'Only PDF files are allowed'}), 400
    
    file_id = str(uuid.uuid4())
    original_filename = secure_filename(file.filename)
    pdf_filename = f"{file_id}_{original_filename}"
    docx_filename = f"{file_id}_{original_filename.rsplit('.', 1)[0]}.docx"
    
    pdf_path = os.path.join(app.config['UPLOAD_FOLDER'], pdf_filename)
    docx_path = os.path.join(app.config['UPLOAD_FOLDER'], docx_filename)
    
    try:
        # Save uploaded file
        file.save(pdf_path)
        logger.info(f"File saved: {pdf_path}")
        
        # Convert PDF to DOCX
        logger.info("Starting conversion...")
        success = convert_pdf_to_docx(pdf_path, docx_path)
        
        if not success:
            # Clean up on conversion failure
            cleanup_file(pdf_path)
            cleanup_file(docx_path)
            return jsonify({'error': 'Failed to convert PDF file. The file might be corrupted or protected.'}), 500
        
        if not os.path.exists(docx_path):
            cleanup_file(pdf_path)
            return jsonify({'error': 'Conversion failed - no output file created'}), 500
        
        file_size = os.path.getsize(docx_path)
        logger.info(f"Conversion successful. File size: {file_size} bytes")
        
        # Register files for cleanup
        register_file(file_id, pdf_path, docx_path)
        
        return jsonify({
            'success': True,
            'message': 'File converted successfully',
            'file_id': file_id,
            'filename': docx_filename,
            'original_filename': original_filename,
            'file_size': file_size
        })
        
    except Exception as e:
        # Clean up on any error
        cleanup_file(pdf_path)
        cleanup_file(docx_path)
        logger.error(f"Unexpected error: {str(e)}")
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@app.route('/download/<file_id>/<filename>', methods=['GET'])
def download_file(file_id, filename):
    """
    Download converted file and trigger cleanup
    """
    try:
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        # Security checks
        if not os.path.exists(file_path) or '..' in filename or not filename.endswith('.docx'):
            return jsonify({'error': 'File not found'}), 404
        
        # Verify file belongs to the file_id
        if not filename.startswith(file_id):
            return jsonify({'error': 'Invalid file access'}), 403
        
        # Get original filename for download
        original_name = filename.split('_', 1)[1] if '_' in filename else 'converted.docx'
        
        # Mark for cleanup after download
        mark_file_downloaded(file_id)
        
        return send_file(
            file_path,
            as_attachment=True,
            download_name=original_name,
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
        
    except Exception as e:
        logger.error(f"Download error: {str(e)}")
        return jsonify({'error': 'File not found'}), 404

@app.route('/cleanup', methods=['POST'])
def manual_cleanup():
    """
    Manual cleanup endpoint (optional)
    """
    try:
        files_cleaned = 0
        current_time = datetime.now().timestamp()
        
        for file_id, file_data in list(file_registry.items()):
            # Clean up files older than 30 minutes or already downloaded
            if current_time - file_data['created_time'] > 1800 or file_data.get('downloaded', False):
                file_data = file_registry.pop(file_id, None)
                if file_data:
                    if cleanup_file(file_data.get('pdf_path')):
                        files_cleaned += 1
                    if cleanup_file(file_data.get('docx_path')):
                        files_cleaned += 1
        
        return jsonify({
            'message': f'Cleaned up {files_cleaned} files',
            'files_remaining': len(file_registry)
        })
    
    except Exception as e:
        logger.error(f"Cleanup error: {str(e)}")
        return jsonify({'error': 'Cleanup failed'}), 500

# Error handlers
@app.errorhandler(413)
def too_large(e):
    return jsonify({'error': 'File size exceeds 20MB limit'}), 413

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

# Start cleanup thread when app starts
@app.before_first_request
def start_cleanup_thread():
    cleanup_thread = threading.Thread(target=cleanup_old_files, daemon=True)
    cleanup_thread.start()
    logger.info("Cleanup thread started")

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)