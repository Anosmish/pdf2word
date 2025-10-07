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
import atexit

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# CORS configuration - UPDATE WITH YOUR FRONTEND URL
frontend_url = "https://your-frontend-app.netlify.app"  # ← UPDATE THIS
CORS(app, resources={
    r"/*": {
        "origins": [
            frontend_url,
            "http://localhost:3000",
            "http://localhost:8000"
        ]
    }
})

# Configuration
app.config['MAX_CONTENT_LENGTH'] = 20 * 1024 * 1024
app.config['UPLOAD_FOLDER'] = tempfile.gettempdir()
ALLOWED_EXTENSIONS = {'pdf'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def convert_pdf_to_docx(pdf_path, docx_path):
    """
    Convert PDF to DOCX with detailed error handling
    """
    try:
        logger.info(f"Starting conversion: {pdf_path} -> {docx_path}")
        
        # Check if PDF file exists and is readable
        if not os.path.exists(pdf_path):
            logger.error(f"PDF file does not exist: {pdf_path}")
            return False
            
        # Get file size
        file_size = os.path.getsize(pdf_path)
        logger.info(f"PDF file size: {file_size} bytes")
        
        # Perform conversion
        cv = Converter(pdf_path)
        cv.convert(docx_path, start=0, end=None)
        cv.close()
        
        # Check if DOCX was created
        if os.path.exists(docx_path):
            docx_size = os.path.getsize(docx_path)
            logger.info(f"Conversion successful! DOCX file size: {docx_size} bytes")
            return True
        else:
            logger.error("Conversion failed - no DOCX file created")
            return False
            
    except Exception as e:
        logger.error(f"Conversion error: {str(e)}")
        return False

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy', 
        'timestamp': datetime.utcnow().isoformat()
    })

@app.route('/convert', methods=['POST'])
def convert_pdf():
    """
    Convert PDF to Word document
    """
    logger.info("Received conversion request")
    
    if 'file' not in request.files:
        logger.error("No file in request")
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        logger.error("Empty filename")
        return jsonify({'error': 'No file selected'}), 400
    
    if not allowed_file(file.filename):
        logger.error(f"Invalid file type: {file.filename}")
        return jsonify({'error': 'Only PDF files are allowed'}), 400
    
    # Generate unique file IDs
    file_id = str(uuid.uuid4())
    original_filename = secure_filename(file.filename)
    
    # Create filenames
    pdf_filename = f"{file_id}.pdf"
    docx_filename = f"{file_id}.docx"
    
    pdf_path = os.path.join(app.config['UPLOAD_FOLDER'], pdf_filename)
    docx_path = os.path.join(app.config['UPLOAD_FOLDER'], docx_filename)
    
    logger.info(f"Processing file: {original_filename}")
    logger.info(f"PDF path: {pdf_path}")
    logger.info(f"DOCX path: {docx_path}")
    
    try:
        # Save uploaded PDF file
        file.save(pdf_path)
        logger.info(f"PDF saved successfully: {os.path.getsize(pdf_path)} bytes")
        
        # Convert PDF to DOCX
        logger.info("Starting PDF to DOCX conversion...")
        success = convert_pdf_to_docx(pdf_path, docx_path)
        
        if not success:
            # Clean up on failure
            if os.path.exists(pdf_path):
                os.remove(pdf_path)
            return jsonify({'error': 'Conversion failed. The PDF might be corrupted, protected, or contain unsupported content.'}), 500
        
        # Verify conversion worked
        if not os.path.exists(docx_path):
            if os.path.exists(pdf_path):
                os.remove(pdf_path)
            return jsonify({'error': 'Conversion failed - no output file created'}), 500
        
        # Get file sizes for logging
        pdf_size = os.path.getsize(pdf_path)
        docx_size = os.path.getsize(docx_path)
        
        logger.info(f"Conversion completed! PDF: {pdf_size} bytes -> DOCX: {docx_size} bytes")
        
        # Clean up PDF file immediately (we don't need it anymore)
        if os.path.exists(pdf_path):
            os.remove(pdf_path)
            logger.info("Cleaned up PDF file")
        
        return jsonify({
            'success': True,
            'message': 'File converted successfully',
            'file_id': file_id,
            'filename': docx_filename,
            'original_filename': original_filename.replace('.pdf', '.docx'),
            'file_size': docx_size
        })
        
    except Exception as e:
        # Clean up on any error
        if os.path.exists(pdf_path):
            os.remove(pdf_path)
        if os.path.exists(docx_path):
            os.remove(docx_path)
            
        logger.error(f"Unexpected error: {str(e)}")
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@app.route('/download/<file_id>', methods=['GET'])
def download_file(file_id):
    """
    Download converted Word file
    """
    try:
        # Security check
        if '..' in file_id or len(file_id) != 36:  # UUID length
            return jsonify({'error': 'Invalid file ID'}), 400
        
        filename = f"{file_id}.docx"
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        logger.info(f"Download request for: {filename}")
        logger.info(f"File path: {file_path}")
        logger.info(f"File exists: {os.path.exists(file_path)}")
        
        # Check if file exists
        if not os.path.exists(file_path):
            logger.error(f"File not found: {file_path}")
            return jsonify({'error': 'File not found or expired'}), 404
        
        # Get file size
        file_size = os.path.getsize(file_path)
        logger.info(f"Serving file: {filename} ({file_size} bytes)")
        
        # Schedule cleanup after 60 seconds
        threading.Timer(60.0, lambda: cleanup_file(file_path)).start()
        
        # Send the file
        return send_file(
            file_path,
            as_attachment=True,
            download_name=f"converted_{file_id}.docx",
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
        
    except Exception as e:
        logger.error(f"Download error: {str(e)}")
        return jsonify({'error': 'Download failed'}), 500

def cleanup_file(file_path):
    """
    Clean up a single file
    """
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            logger.info(f"Cleaned up file: {file_path}")
            return True
    except Exception as e:
        logger.error(f"Cleanup error for {file_path}: {str(e)}")
    return False

@app.route('/test', methods=['GET'])
def test_endpoint():
    """
    Test endpoint to verify backend is working
    """
    return jsonify({
        'status': 'working',
        'timestamp': datetime.utcnow().isoformat(),
        'message': 'Backend is running correctly'
    })

# Error handlers
@app.errorhandler(413)
def too_large(e):
    return jsonify({'error': 'File size exceeds 20MB limit'}), 413

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    logger.info(f"Starting PDF to Word converter on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
