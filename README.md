# Image Watermark Web Service

A web service that allows users to batch apply watermarks to JPEG images and download them as ZIP files.

## 🚀 Features

### Core Functionality
- **Batch Image Processing**: Upload multiple JPEG images (.jpg/.jpeg) and apply watermarks simultaneously
- **Flexible Watermark Settings**: Customize text, font, size (12-500px), position, color, transparency, and shadow effects
- **Hybrid Processing**: Automatic selection between client-side (Canvas API) and server-side (Sharp) processing based on file size
- **Smart Download**: Automatic selection between ZIP bulk download (≤4MB) or individual downloads (>4MB)
- **Real-time Preview**: View original and processed images with toggle functionality
- **Reprocessing**: Modify settings and reprocess without re-uploading images

### Authentication & Management
- **Monthly Invitation Codes**: Subscription-based access with YYYYMM-XXXXX format codes
- **Admin Dashboard**: Generate invitation codes, view usage statistics, manage Slack notifications
- **Session Management**: Persistent sessions until month-end for users, 24-hour JWT tokens for admins

### Advanced Features
- **Queue System**: Process one user at a time with waiting queue (max 5 users, 10-minute timeout)
- **High-resolution Support**: Smart font sizing with optimized steps for ultra-high resolution images
- **Progress Tracking**: Real-time processing progress with file-by-file status updates
- **Error Handling**: Comprehensive error management with user-friendly messages and partial failure recovery
- **Responsive Design**: Full mobile and desktop compatibility

## 🛠 Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Vercel Serverless Functions
- **Database**: Neon PostgreSQL
- **Image Processing**: HTML5 Canvas API, Sharp (Node.js)
- **Authentication**: JWT, bcrypt
- **Deployment**: Vercel
- **Additional**: JSZip, Slack Webhooks

## 📋 Requirements

### File Limitations
- **Supported formats**: .jpg, .jpeg only
- **File size**: Max 3MB per file
- **Batch size**: Max 5 files, total 15MB per request
- **Processing**: Max 1 concurrent user, others queued

### Processing Methods
- **Client-side (Canvas API)**: Single file ≤1.5MB (fast, no server load)
- **Server-side (Sharp)**: Multiple files or >1.5MB (high quality, server processing)

### Download Options
- **ZIP Bundle**: Total processed size ≤4MB (convenient, single download)
- **Individual Files**: Total size >4MB (reliable, multiple downloads)

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- PostgreSQL database (Neon recommended)
- Vercel account for deployment

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Murasan201/image-watermark-web-service.git
   cd image-watermark-web-service
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create `.env.local` file:
   ```env
   # Database
   DATABASE_URL=your_neon_postgresql_url
   
   # Admin Authentication
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD_HASH=your_bcrypt_hash
   JWT_SECRET=your_jwt_secret_32_chars_min
   
   # Slack Notifications (Optional)
   ENCRYPT_KEY=your_32_char_encryption_key
   ```

4. **Set up database**
   ```bash
   node scripts/setup-database.js
   ```

5. **Run development server**
   ```bash
   npm run dev
   ```

6. **Access application**
   - Main app: http://localhost:3000
   - Admin panel: http://localhost:3000/admin

## 🗄 Database Schema

The application uses 5 main tables:

- `invitation_codes` - Monthly invitation code management
- `user_sessions` - User session tracking
- `admin_sessions` - Admin session management
- `admin_settings` - Admin configuration (Slack webhooks)
- `processing_queue` - Queue system for concurrent processing control

## 🔐 Authentication

### User Authentication
- **Method**: Monthly invitation codes (YYYYMM-XXXXX format)
- **Validity**: Until end of current month
- **Session**: Persistent until month-end
- **Access**: Subscription-based service

### Admin Authentication
- **Method**: Fixed username/password with JWT
- **Session**: 24-hour valid tokens
- **Features**: Code generation, statistics, Slack notifications

## 🎨 Watermark Features

### Text Settings
- **Custom text**: Any text input
- **Fonts**: Arial, Georgia, Times New Roman, Helvetica
- **Size**: 12-500px with smart stepping
  - 12-50px: 1px steps (fine tuning)
  - 50-100px: 2px steps (standard)
  - 100-200px: 5px steps (large)
  - 200-500px: 10px steps (ultra-large)

### Positioning & Styling
- **Positions**: Top-left, Top-right, Center, Bottom-left, Bottom-right
- **Color**: Full color picker support
- **Transparency**: 10-100% opacity
- **Shadow**: Toggle on/off with X/Y offset and opacity controls

## 📱 Usage

1. **Authentication**: Enter monthly invitation code
2. **Upload**: Drag & drop or select JPEG images (max 5 files, 15MB total)
3. **Configure**: Set watermark text, font, size, position, color, and effects
4. **Preview**: Toggle between original and processed images
5. **Process**: Click "Apply Watermark" to process all images
6. **Download**: Automatically get ZIP bundle or individual files

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/verify` - Verify invitation code
- `GET /api/auth/session` - Check user session
- `DELETE /api/auth/session` - User logout

### Admin
- `POST /api/admin/auth` - Admin login
- `GET /api/admin/invitation-codes` - List invitation codes
- `POST /api/admin/invitation-codes` - Generate new codes
- `GET /api/admin/slack-settings` - Get Slack settings

### Processing
- `POST /api/process-images` - Server-side image processing
- `GET /api/queue` - Check processing queue status
- `POST /api/queue/cleanup` - Queue cleanup (cron)

## 🚀 Deployment

### Vercel Deployment
1. Connect GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Environment Variables for Production
```env
DATABASE_URL=neon_postgresql_production_url
ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD_HASH=bcrypt_hashed_password
JWT_SECRET=secure_random_32_char_string
ENCRYPT_KEY=aes_encryption_key_32_chars
```

## 🛡 Security Features

- **HTTPS**: Enforced for all connections
- **Password Security**: bcrypt hashing for admin passwords
- **Session Management**: Secure JWT tokens and database sessions
- **File Validation**: Strict JPEG file type and size validation
- **Rate Limiting**: Processing queue prevents abuse
- **Encryption**: Sensitive settings encrypted in database

## 🔍 Monitoring & Maintenance

- **Error Logging**: Comprehensive error tracking and user-friendly messages
- **Queue Management**: Automatic cleanup of stale processing sessions
- **Session Cleanup**: Automated removal of expired sessions
- **Slack Integration**: Real-time notifications for admin activities

## 📞 Support

- **Issues**: Report bugs and feature requests via GitHub Issues
- **Documentation**: Full project specifications in `image-watermark-web-service-spec.md`
- **Development Guide**: Detailed implementation notes in `CLAUDE.md`

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🎯 Project Status

- ✅ **Phase 1-5**: Complete (100% - All core features implemented)
- ⏳ **Phase 6**: Testing & Quality Assurance (Planned)
- 🚀 **Production**: Live at https://image-watermark-web-service.vercel.app

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

**Built with ❤️ for content creators who need efficient watermarking solutions**