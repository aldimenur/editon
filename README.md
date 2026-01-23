Editor Asset Management App - Aplikasi manajemen aset untuk editor yang membantu mengelola file audio, video, dan gambar dengan mudah.

## 📋 Deskripsi

Editon adalah aplikasi desktop berbasis Tauri yang dirancang untuk membantu editor dalam mengelola dan mengorganisir aset media mereka. Aplikasi ini menyediakan fitur-fitur lengkap untuk mengelola file audio (SFX), video, dan gambar dengan database terintegrasi dan antarmuka yang modern.

## ✨ Fitur Utama

### 🎵 Manajemen Audio (SFX)
- **Visualisasi Waveform**: Tampilkan waveform audio menggunakan Wavesurfer.js
- **Pencarian & Filter**: Cari file audio dengan cepat berdasarkan nama
- **Multiple View Modes**: Tampilan list, grid, dan large view
- **Virtual Scrolling**: Performa optimal untuk koleksi audio besar
- **Metadata Audio**: Informasi sample rate, bitrate, dan artist
- **Sinkronisasi Folder**: Sync database dengan folder audio secara otomatis

### 🎬 Manajemen Video
- **Thumbnail Generation**: Generate thumbnail otomatis untuk video
- **Metadata Video**: Informasi resolusi (width, height) dan FPS
- **Preview Video**: Preview video sebelum digunakan

### 🖼️ Manajemen Gambar
- **Thumbnail Generation**: Generate thumbnail untuk gambar
- **Metadata Image**: Informasi resolusi dan format file
- **Multiple Format Support**: JPG, PNG, WebP, GIF, BMP, SVG, ICO

### 📥 YouTube Download
- **Download Video/Audio**: Download konten dari YouTube menggunakan yt-dlp
- **Format Selection**: Pilih format video atau audio
- **Progress Tracking**: Pantau progress download secara real-time

### 🔄 Database Sync
- **Auto Sync**: Sinkronisasi otomatis antara database dan file system
- **Add/Update/Remove**: Deteksi file baru, update file yang diubah, dan hapus file yang sudah tidak ada
- **Transaction Safety**: Operasi database yang aman dengan transaction

## 🛠️ Tech Stack

### Frontend
- **React 18** - UI Framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **Radix UI** - UI Components
- **Wavesurfer.js** - Audio visualization
- **Zustand** - State management
- **TanStack Virtual** - Virtual scrolling

### Backend
- **Tauri 2** - Desktop framework
- **Rust** - Backend language
- **SQLite (rusqlite)** - Database
- **Symphonia** - Audio metadata extraction
- **FFmpeg** - Video/audio processing
- **yt-dlp** - YouTube downloader
- **Image Processing** - fast_image_resize, image, libwebp

## 📦 Prerequisites

Sebelum menjalankan aplikasi, pastikan Anda telah menginstall:

- **Node.js** (v18 atau lebih baru)
- **Rust** (latest stable)
- **FFmpeg** (untuk processing video/audio)
- **yt-dlp** (untuk YouTube download)

## 🚀 Instalasi

1. Clone repository:
```bash
git clone https://github.com/aldimenur/editon.git
cd editon
```

2. Install dependencies frontend:
```bash
npm install
```

3. Install dependencies backend (Rust):
```bash
cd src-tauri
cargo build
cd ..
```

## 💻 Development

Jalankan aplikasi dalam mode development:

```bash
npm run tauri dev
```

Aplikasi akan terbuka di `http://localhost:1420`

## 🏗️ Build

Build aplikasi untuk production:

```bash
npm run tauri build
```

Output akan tersedia di `src-tauri/target/release/`

## 📁 Struktur Project

```
editon/
├── src/                    # Frontend React code
│   ├── components/         # React components
│   │   ├── ui/            # UI components (Radix UI)
│   │   ├── wavesurfer.tsx # Audio waveform component
│   │   └── ...
│   ├── pages/             # Page components
│   │   ├── sfx/           # Sound effects page
│   │   ├── video/         # Video management page
│   │   ├── image/         # Image management page
│   │   └── youtube-download/ # YouTube download page
│   ├── stores/            # Zustand stores
│   └── types/             # TypeScript types
├── src-tauri/             # Backend Rust code
│   ├── src/
│   │   ├── lib.rs         # Main library
│   │   ├── db_lib.rs      # Database operations
│   │   ├── sound_lib.rs   # Audio processing
│   │   ├── image_lib.rs   # Image processing
│   │   ├── ffmpeg.rs      # FFmpeg integration
│   │   └── yt_dlp.rs      # YouTube downloader
│   └── Cargo.toml         # Rust dependencies
└── package.json           # Node.js dependencies
```

## 🎯 Penggunaan

### Menambahkan Folder Audio
1. Buka halaman **Sound** dari sidebar
2. Klik tombol **Select Folder** untuk memilih folder audio
3. Aplikasi akan memindai folder dan menambahkan file ke database
4. Gunakan tombol **Sync** untuk menyinkronkan perubahan

### Download dari YouTube
1. Buka halaman **YouTube Download**
2. Masukkan URL video YouTube
3. Pilih format (video atau audio)
4. Klik **Download** dan tunggu proses selesai

### Mencari File
- Gunakan search bar di setiap halaman untuk mencari file berdasarkan nama
- Hasil pencarian akan ditampilkan secara real-time

## 🔧 Konfigurasi

### Update Configuration
Aplikasi menggunakan auto-updater. Konfigurasi updater ada di `src-tauri/tauri.conf.json`:

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://raw.githubusercontent.com/aldimenur/editon/refs/heads/main/update.json"
      ]
    }
  }
}
```

## 📝 Database Schema

Aplikasi menggunakan SQLite untuk menyimpan metadata aset:

- **Assets Table**: Menyimpan informasi file (filename, path, type, metadata, waveform data)
- **Metadata**: Disimpan sebagai JSON untuk fleksibilitas
- **Thumbnails**: Path ke file thumbnail yang di-generate

## 🤝 Contributing

Kontribusi sangat diterima! Silakan buat issue atau pull request.

## 📄 License

[Tambahkan license sesuai kebutuhan]

## 👤 Author

**aldimenur**

- GitHub: [@aldimenur](https://github.com/aldimenur)

## 🙏 Acknowledgments

- [Tauri](https://tauri.app/) - Desktop framework
- [Wavesurfer.js](https://wavesurfer.js.org/) - Audio visualization
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - YouTube downloader
- [Radix UI](https://www.radix-ui.com/) - UI components

---

**Note**: Pastikan FFmpeg dan yt-dlp sudah terinstall di sistem Anda untuk fitur video processing dan YouTube download berfungsi dengan baik.
```