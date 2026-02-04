Editon - Desktop Asset Manager for Audio, Video, and Images

## 📌 Ringkas

Editon adalah aplikasi desktop berbasis Tauri untuk mengelola aset media editor: audio (SFX), video, dan gambar. Aplikasi ini memindai folder, menyimpan metadata ke database lokal, dan menyediakan UI cepat untuk pencarian, preview, tagging, dan manajemen file.

## 🆕 Update Terbaru (v0.1.9)

- **Consistency Feature**: Tampilan dan perilaku konsisten di setiap tab.
- **Settings & App Updates**: Halaman Settings untuk cek update dan instalasi update.
- **Auto Update Check**: Cek update otomatis saat aplikasi dibuka.

## ✨ Fitur Utama

### 🎵 Audio (SFX)
- **Waveform Viewer** dengan Wavesurfer
- **Search + Tag Filter** (real-time, multi-token)
- **List / Grid / Large View**
- **Virtual Scrolling** untuk koleksi besar
- **Tagging, Rename, Delete, Reveal in Folder**

### 🎬 Video
- **Thumbnail + Inline Preview**
- **Search + Tag Filter**
- **List / Grid / Large View**
- **Tagging, Rename, Delete, Reveal in Folder**
- **Info ukuran file** dan quick preview

### 🖼️ Gambar
- **Thumbnail + Modal Preview** (zoom & metadata)
- **Search + Tag Filter**
- **List / Grid / Large View**
- **Tagging, Rename, Delete, Reveal in Folder**

### 📥 YouTube Download
- **Download Video / Audio** dengan yt-dlp
- **Pilih Format** (MP4/WebM/MKV atau MP3/M4A/Opus/WAV)
- **Pilih Lokasi Unduhan**
- **Progress Status**
- **Dependency Checker & Installer** (ffmpeg, ffprobe, yt-dlp)

### ⚙️ Settings & Updates
- **Info versi aplikasi**
- **Manual update check**
- **In-app update install**

## 🧭 Cara Pakai Cepat

1. Klik **Scan Folder** untuk memilih folder aset.
2. Editon akan memindai folder dan mengimpor file ke database lokal.
3. Gunakan search bar dan filter tag untuk menemukan file.
4. Klik item untuk preview (audio/video/image), edit tag, rename, atau delete.
5. Buka tab **Settings** untuk cek update aplikasi.

## 🛠️ Tech Stack

### Frontend
- React 18
- TypeScript
- Vite
- Tailwind CSS
- Radix UI
- Wavesurfer.js
- Zustand
- TanStack Virtual

### Backend
- Tauri 2
- Rust
- SQLite (rusqlite)
- Symphonia (audio metadata)
- FFmpeg / ffprobe (video & audio processing)
- yt-dlp
- Image processing (fast_image_resize, image, libwebp)

## 📦 Prerequisites

- **Node.js** v18+
- **Rust** (stable)
- **FFmpeg** dan **yt-dlp** (bisa diunduh lewat aplikasi)

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

3. Build backend (Rust):
```bash
cd src-tauri
cargo build
cd ..
```

## 💻 Development

```bash
npm run tauri dev
```

Aplikasi terbuka di `http://localhost:1420`.

## 🏗️ Build

```bash
npm run tauri build
```

Output build tersedia di `src-tauri/target/release/`.

## 🔧 Update System

Konfigurasi auto-updater ada di `src-tauri/tauri.conf.json` dan menggunakan manifest `update.json` di root repository.

## 📁 Struktur Project (Ringkas)

```
editon/
├── src/                 # Frontend React
│   ├── components/      # UI + shared components
│   ├── pages/           # SFX, Video, Image, YouTube, Settings
│   └── stores/          # Zustand stores
├── src-tauri/           # Backend Rust
│   └── src/             # DB, audio, video, image, yt-dlp
└── update.json          # Update manifest
```

## 📝 Database

Editon menyimpan metadata aset di SQLite, termasuk:
- Path file, ukuran, tipe
- Metadata media (resolusi, codec, dsb.)
- Tag untuk pencarian dan filter

## 🤝 Contributing

Pull request dan issue sangat disambut.

## 📄 License

[Tambahkan license sesuai kebutuhan]

## 👤 Author

**aldimenur**

