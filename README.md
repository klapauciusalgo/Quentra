# 🕹️ QuietAlgo — Pixel Trading Floor & Crypto Algo Trade Platform

Platform trading kuantitatif dan visualisasi sinyal Bitcoin (**BTCUSDT**) yang menggabungkan estetika **Pixel-Art 16-Bit Isometric Trading Floor** (sesuai spesifikasi [`Design.md`](file:///home/ubuntu/QuietAlgo/Design.md)) dengan arsitektur algoritma trading Smart Money Concepts (SMC), Multi-Timeframe (MTF) momentum, dan tren makro siklus Bitcoin dari data historis Binance 2020–2026.

---

## 🌟 Fitur Utama Platform

1. **Pixel Trading Floor (16-Bit Living Office)**:
   - Ruang kantor isometrik retro dengan 5 agen AI kuantitatif yang aktif bekerja:
     - **Researcher**: Memindai likuiditas makro, metriks on-chain, dan sentimen derivatif.
     - **Quant**: Menjalankan indikator teknikal, breakout internal SMC, dan Moving Average.
     - **Trader**: Workstation berdiri dengan headset dan pita ticker, mengeksekusi panggilan arah (Long/Short/Wait).
     - **Informan**: Berada di dekat jendela dengan papan outlook makro (siklus Weekly MA55).
     - **Risk Officer**: Menjaga batas leverage, buffer likuidasi (-96%), dan alokasi margin 20%.
   - **Central Floor Screen / Arcade Terminal Ticket**: Menampilkan sinyal live yang aktif lengkap dengan confidence meter bar tersegmentasi, target entry, stop loss, dan breakeven lock.
   - **Interaktif**: Klik setiap meja agent untuk membuka **Reasoning Log** analisis lengkap dalam teks transparan.

2. **Interactive Candlestick Chart BTCUSDT (TradingView Lightweight Charts)**:
   - Timeframe lengkap: **`30m`**, **`1h`**, **`4h`**, **`1D`**, **`1W`**.
   - Indikator moving average bawaan: **MA8**, **MA25**, **MA50**, **MA55 (Macro Weekly Anchor)**, dan **MA111 (Pi Cycle)**.
   - **Strategy Execution Markers**: Visualisasi panah hijau (Buy/Long) dan panah merah (Sell/Exit/Short) historis langsung di atas chart candlestick saat strategi dipilih!
   - Tooltip OHLCV presisi tinggi dengan pelacakan kursor crosshair.

3. **Koneksi Live WebSocket Binance**:
   - Backend terhubung otomatis ke WebSocket publik Binance (`wss://stream.binance.com:9443/ws/btcusdt@ticker` dan `kline_30m`).
   - Menyediakan streaming harga live BTCUSDT secara real-time, statistik 24 jam (High, Low, Volume, % Change).
   - Fallback cerdas dan penggabungan dengan dataset historis lokal dari `/home/ubuntu/BTC-analysis/data`.
   - Reconnect otomatis jika koneksi terputus.

4. **Katalog 8 Algoritma Trading Unggulan (Long & Short)**:
   - **Long Strategies**:
     1. **Pippo 30M Alpha (Pure Runner)**: Asymmetric structure (36-bar entry / 96-bar exit) + filter makro 4H SMA 111 & 1H EMA 50 (+2,185.4% return).
     2. **Pippo 1h Enhanced (Flagship SMC)**: Transpiled SMC ke 1H dengan trailing floor 48 jam & breakeven dinamis +5% (+2,312.35% return, Win Rate 65.62%, Profit Factor 3.81x).
     3. **Pippo 30m Scalp-Runner**: Hybrid take-profit (ambil 30% cuan di +4.0% dan biarkan 70% sisa posisi berlari bebas risiko) (+1,780.2% return, Win Rate 69.33%).
     4. **Pure Macro Weekly MA55**: Model siklus 4-tahunan Bitcoin (Weekly Close >= MA55 = Long, < MA55 = Short/Cash). Hanya 6 trade selama 6 tahun (+2,067.56% return, Win Rate 66.7%).
     5. **Pippo 4h Original**: Mesin Smart Money Concepts klasik asli Pine Script v5 (+1,074.17% return, Win Rate 43.54%, Profit Factor 2.19x).
   - **Short Strategies**:
     1. **Pippo 30M Short V2 Type A (Active TP)**: Fokus Win Rate tertinggi saat bearish (73.7% Win Rate, Take Profit cepat 12%, Fast Breakeven 1.5%).
     2. **Pippo 30M Short V2 Type B (Max Frequency)**: Memanfaatkan momentum dump dengan frekuensi trade maksimal (103 trade, +72.9% return, TP 20%).
     3. **Pippo 30M Short V2 Type C (Defensive Fortress)**: Benteng pertahanan ultra aman (hanya terkena 3 Stop Loss sepanjang 6 tahun sejarah!).

5. **Algo Explorer & Preference Matcher**:
   - Filter cepat berdasarkan arah (Long / Short / All), timeframe (30m, 1h, 4h, 1W), dan gaya risiko.
   - Pilihan tampilan: **Card Grid View** atau **Comparison Matrix Table**.
   - Modal deep-dive per strategi dengan metrik lengkap, parameter aturan, breakdown YoY (2020–2026), dan tabel riwayat trade lengkap dengan fitur pencarian.

6. **Kalkulator Risiko & Likuidasi Leverage**:
   - Perhitungan matematis keamanan margin 20% dengan leverage 5x (Effective leverage 1.0x).
   - Menghitung jarak likuidasi riil Bitcoin (-96%) dan proyeksi compounding modal awal.

7. **Audio FX Retro 8-Bit Synthesizer**:
   - Efek suara chiptune arcade yang disintesis langsung via Web Audio API browser (klik tombol, select algo, dan dispatch sinyal baru), lengkap dengan tombol mute di header.

---

## 📁 Struktur Proyek

```
/home/ubuntu/QuietAlgo/
├── backend/
│   ├── main.py              # FastAPI app (REST APIs + WebSocket /ws + Static frontend hosting)
│   ├── binance_ws.py        # Klien Binance WebSocket dengan auto-reconnect & broadcast
│   ├── pixel_floor.py       # Engine state Pixel Trading Floor (agen, dialog, tiket sinyal)
│   ├── generate_data.py     # Script ekstraksi data dari /home/ubuntu/BTC-analysis
│   └── data/
│       ├── klines_cache.json    # Candlestick 30m, 1h, 4h, 1d, 1w teroptimasi
│       ├── strategies.json      # Katalog lengkap 8 strategi, metrik, parameter & trade log
│       └── BTCUSDT_1d.parquet   # Dataset harian hasil resample
├── frontend/
│   ├── index.html           # Font pixel Press Start 2P & JetBrains Mono
│   ├── package.json
│   ├── vite.config.js       # Proxy API & WebSocket ke backend
│   ├── tailwind.config.js   # Konfigurasi palet warna Design.md & border pixel
│   └── src/
│       ├── App.jsx          # Komponen utama platform
│       ├── index.css        # Efek pixelated, CRT scanlines & styling arcade
│       ├── components/
│       │   ├── Header.jsx             # Ticker BTC live, Binance WS status, session
│       │   ├── PixelTradingFloor.jsx  # Ruang kantor 16-bit dengan animasi agen
│       │   ├── SignalTicket.jsx       # Kartu tiket sinyal retro arcade
│       │   ├── TradingChart.jsx       # Chart TradingView (30m/1h/4h/1D/1W) + Trade Markers
│       │   ├── AlgoExplorer.jsx       # Explorer strategi, filter preferensi & tabel matrix
│       │   ├── StrategyDetail.jsx     # Modal parameter, YoY stats, dan trade log
│       │   ├── AgentDrawer.jsx        # Drawer log analisis agent
│       │   └── RiskCalculator.jsx     # Kalkulator leverage & jarak likuidasi
│       └── utils/
│           └── formatters.js          # Format mata uang & Web Audio API synthesizer 8-bit
├── run.sh                   # Script peluncur satu pintu
├── Design.md                # Spesifikasi acuan desain pixel trading floor
└── README.md                # Dokumentasi platform
```

---

## 🚀 Cara Menjalankan Platform

### 1. Menjalankan Satu Pintu (Produksi / Dev Langsung)
Cukup jalankan script peluncur utama:
```bash
cd /home/ubuntu/QuietAlgo
./run.sh
```
Platform akan aktif pada **`http://localhost:8080`** (atau port server Anda), menyajikan frontend React, koneksi Binance WebSocket live, dan API endpoint sekaligus!

### 2. Mode Pengembangan Frontend (Vite HMR)
Jika Anda ingin mengembangkan UI frontend dengan Hot Module Reloading:
```bash
cd /home/ubuntu/QuietAlgo/frontend
npm run dev
```
Aplikasi frontend akan aktif di `http://localhost:5173` dengan proxy otomatis ke backend di port 8080.

---

## 📡 REST & WebSocket Endpoints

| Endpoint | Tipe | Keterangan |
|---|---|---|
| `/` | `GET` | Antarmuka web frontend QuietAlgo |
| `/api/status` | `GET` | Status sistem, status Binance WS, harga BTC terkini |
| `/api/ticker` | `GET` | Data ticker BTCUSDT (harga, high 24h, low 24h, volume, % change) |
| `/api/klines?timeframe=30m\|1h\|4h\|1d\|1w&limit=1000` | `GET` | Candlestick OHLCV dengan Moving Averages (MA8, 25, 50, 55, 111) |
| `/api/strategies` | `GET` | Daftar ringkas 8 strategi trading |
| `/api/strategies/{id}` | `GET` | Detail lengkap strategi, parameter, statistik YoY, dan riwayat trade |
| `/api/floor` | `GET` | State ruang Pixel Trading Floor (agen, status, sesi pasar) |
| `/api/floor/select-agent?agent_id=...` | `POST` | Memilih agent aktif & menyalakan lampu meja cyan |
| `/api/floor/simulate-signal?strategy_id=...` | `POST` | Memicu simulasi broadcast sinyal baru ke seluruh klien |
| `/ws` | `WebSocket` | WebSocket stream real-time untuk tick harga, kline, dan alert sinyal |
