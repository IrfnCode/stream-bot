import puppeteer from "puppeteer";
import path from "path";
import fs from "fs";
import axios from "axios";
import extract from "extract-zip";

export const isPlaying = new Map();
export const streamErrors = new Map();
const activeStreamCommand = new Map();

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// FUNGSI RAHASIA: Mengunduh Vencord (Perbaikan URL ke extension-chrome.zip)
async function ensureVencordExtension() {
  const extPath = path.join(process.cwd(), '.vencord_ext');
  const zipPath = path.join(process.cwd(), 'extension-chrome.zip');
  
  if (!fs.existsSync(extPath)) {
    console.log(`[Vencord Downloader] Mengunduh ekstensi Vencord penembus Nitro...`);
    const response = await axios({
      method: 'get',
      url: 'https://github.com/Vendicated/Vencord/releases/download/devbuild/extension-chrome.zip',
      responseType: 'stream'
    });
    
    const writer = fs.createWriteStream(zipPath);
    response.data.pipe(writer);
    
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    
    console.log(`[Vencord Downloader] Mengekstrak Vencord...`);
    await extract(zipPath, { dir: extPath });
    fs.unlinkSync(zipPath); // Hapus ZIP setelah diekstrak
    console.log(`[Vencord Downloader] Ekstensi berhasil dipasang!`);
  } else {
    console.log(`[Vencord Downloader] Ekstensi Vencord sudah terpasang dan siap digunakan.`);
  }
  return extPath;
}

export async function startVideoStream(guildId, channelId, videoUrl, title = "Movie", subtitleUrl = null) {
  if (isPlaying.get(guildId)) {
    throw new Error("Already playing in this guild.");
  }
  isPlaying.set(guildId, true);
  
  try {
    const token = process.env.USER_TOKEN;
    if (!token) throw new Error("USER_TOKEN is not defined in .env!");

    console.log(`[WebRTC Automation] Membuka Google Chrome untuk ${title}...`);
    
    // Buka Chromium
    const browser = await puppeteer.launch({
      executablePath: await puppeteer.executablePath(),
      headless: false,
      defaultViewport: null, 
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--autoplay-policy=no-user-gesture-required',
        '--auto-select-desktop-capture-source=Film Player',
        '--enable-usermedia-screen-capturing',
        '--disable-notifications',
        '--start-maximized'
      ]
    });

    activeStreamCommand.set(guildId, { browser });

    // ---------------------------------------------------------
    // TAB 1: TAB SILUMAN (Layar Hitam Pencegat Autoplay)
    // ---------------------------------------------------------
    const pages = await browser.pages();
    const playerPage = pages.length > 0 ? pages[0] : await browser.newPage(); 
    
    playerPage.on('dialog', async dialog => {
      await dialog.dismiss();
    });

    await playerPage.setContent(`
      <html>
        <head><title>Film Player</title></head>
        <body style="background:black; margin:0; overflow:hidden; display:flex; justify-content:center; align-items:center;">
          <h1 style="color:gray; font-family:sans-serif;">Menunggu Discord Live (Vencord Active)...</h1>
        </body>
      </html>
    `);

    // ---------------------------------------------------------
    // TAB 2: DISCORD WEB + VENCORD INJECTION
    // ---------------------------------------------------------
    const discordPage = await browser.newPage();
    console.log(`[WebRTC Automation] Memasuki Discord Web...`);

    // INJEKSI PEMAKSA BITRATE MAKSIMAL KE MESIN CHROME
    await discordPage.evaluateOnNewDocument(() => {
      const originalSetParameters = RTCRtpSender.prototype.setParameters;
      RTCRtpSender.prototype.setParameters = async function (parameters) {
        if (parameters.encodings) {
          for (const encoding of parameters.encodings) {
            encoding.maxBitrate = 8000000; // 8 Mbps
            encoding.maxFramerate = 60;    // Kunci di 60 FPS
            if (encoding.scaleResolutionDownBy !== undefined) {
              encoding.scaleResolutionDownBy = 1.0; 
            }
          }
        }
        return originalSetParameters.call(this, parameters);
      };
    });
    
    await discordPage.goto('https://discord.com/login', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    
    // Injeksi Token Discord
    await discordPage.evaluate((t) => {
      const iframe = document.createElement('iframe');
      document.body.appendChild(iframe);
      iframe.contentWindow.localStorage.token = `"${t}"`;
    }, token);

    await delay(1000);
    
    console.log(`[WebRTC Automation] Masuk ke Voice Channel...`);
    await discordPage.goto(`https://discord.com/channels/${guildId}/${channelId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    
    // Beri waktu 15 detik agar Vencord selesai memuat dan membobol file inti Discord (Webpack)
    await delay(15000);
    
    // ---------------------------------------------------------
    // AUTOMASI KLIK UI DISCORD
    // ---------------------------------------------------------
    try {
      // 1. Usir semua pop-up pengumuman (termasuk E2EE warning) dengan menekan tombol ESCAPE
      console.log(`[WebRTC Automation] Mengusir pop-up pengumuman...`);
      for(let i=0; i<3; i++) {
         await discordPage.keyboard.press('Escape');
         await delay(500);
      }

      console.log(`[WebRTC Automation] Mengonfirmasi Join Voice...`);
      const channelSelector = `[data-list-item-id="channels___${channelId}"]`;
      try {
        await discordPage.waitForSelector(channelSelector, { timeout: 5000 });
        await discordPage.click(channelSelector);
        await delay(3000);
      } catch (e) {
        console.log(`[WebRTC Automation] Voice channel sudah aktif.`);
      }

      console.log(`[WebRTC Automation] Menekan tombol Share Screen...`);
      let clickedShare = false;
      for (let i = 0; i < 15; i++) { // Coba terus selama 15 detik
        clickedShare = await discordPage.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const shareBtn = buttons.find(b => {
            const label = b.getAttribute('aria-label') || '';
            const l = label.toLowerCase();
            return l.includes('share your screen') || l.includes('bagikan layar');
          });
          if (shareBtn) {
            shareBtn.click();
            return true;
          }
          return false;
        });
        if (clickedShare) break;
        await delay(1000);
      }

      if (!clickedShare) {
        throw new Error("Gagal menemukan tombol Share Screen (Mungkin terhalang pop-up atau beda bahasa).");
      }
      
      await delay(2000);
      
      console.log(`[WebRTC Automation] Mencari tombol 'Go Live'...`);
      let goLiveClicked = false;
      for (let i = 0; i < 8; i++) {
        goLiveClicked = await discordPage.evaluate(() => {
          // Cari berdasarkan teks
          const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
          const goLiveBtn = buttons.find(b => {
            const txt = b.textContent ? b.textContent.toLowerCase().replace(/\\s+/g, ' ').trim() : '';
            return txt === 'go live' || txt.includes('go live') || txt.includes('langsung') || txt.includes('bagikan');
          });
          if (goLiveBtn) {
            goLiveBtn.click();
            return true;
          }
          
          // Jika teks tidak cocok, cari tombol utama (Submit/Primary) di dalam pop-up modal
          const modal = document.querySelector('div[role="dialog"]');
          if (modal) {
             const submitBtn = modal.querySelector('button[type="submit"]');
             if (submitBtn) {
                 submitBtn.click();
                 return true;
             }
          }
          
          return false;
        });
        if (goLiveClicked) break;
        await delay(1000);
      }

      if (goLiveClicked) {
        console.log(`[WebRTC Automation] ✅ BERHASIL! (1080p 60FPS VENCORD VIP LIVE)!`);
      } else {
        console.log(`[WebRTC Automation] ⚠️ Tombol 'Go Live' tetap tidak ditemukan. Mencoba menekan ENTER...`);
        await discordPage.keyboard.press('Enter');
        await delay(1000);
      }

      await delay(4000); // Tunggu koneksi layar stabil
      
      // ---------------------------------------------------------
      // FASE AKHIR: MEMUTAR FILM TANPA TERPOTONG
      // ---------------------------------------------------------
      console.log(`[WebRTC Automation] 🎬 MEMUTAR FILM SEKARANG! (Dari Detik 00:00)`);
      const port = process.env.PORT || 3333;
      let playerUrl = `http://127.0.0.1:${port}/player.html?url=${encodeURIComponent(videoUrl)}`;
      if (subtitleUrl) {
          playerUrl += `&sub=${encodeURIComponent(subtitleUrl)}`;
      }
      await playerPage.goto(playerUrl);
      
      // Maksimalkan performa render di layar depan
      await playerPage.bringToFront();

    } catch (e) {
      console.error(`[WebRTC Automation] Gagal menavigasi UI Discord:`, e.message);
    }

  } catch (error) {
    console.error("Error during playback:", error);
    if (activeStreamCommand.has(guildId)) {
      try {
        const { browser } = activeStreamCommand.get(guildId);
        const pages = await browser.pages();
        for (let i = 0; i < pages.length; i++) {
          const pageTitle = await pages[i].title().catch(() => `Page_${i}`);
          const cleanTitle = pageTitle.replace(/[^a-zA-Z0-9]/g, '_');
          const ssPath = `error_screenshot_${i}_${cleanTitle}.png`;
          await pages[i].screenshot({ path: ssPath }).catch(console.error);
          console.log(`[Debug] Screenshot halaman ${i} disimpan ke: ${ssPath}`);
        }
      } catch (err) {
        console.error("Gagal mengambil screenshot error:", err.message);
      }
    }
    streamErrors.set(guildId, error.message);
    stopVideoStream(guildId);
    throw error;
  }
}

export async function pauseVideoStream(guildId) {
  const active = activeStreamCommand.get(guildId);
  if (active && active.browser) {
    const pages = await active.browser.pages();
    for (const page of pages) {
      if (page.url().includes('player.html')) {
        await page.evaluate(() => {
          const v = document.getElementById('video');
          if (v) v.pause();
        });
        return true;
      }
    }
  }
  return false;
}

export async function resumeVideoStream(guildId) {
  const active = activeStreamCommand.get(guildId);
  if (active && active.browser) {
    const pages = await active.browser.pages();
    for (const page of pages) {
      if (page.url().includes('player.html')) {
        await page.evaluate(() => {
          const v = document.getElementById('video');
          if (v) v.play();
        });
        return true;
      }
    }
  }
  return false;
}

export async function skipVideoStream(guildId) {
  return stopVideoStream(guildId);
}

export async function stopVideoStream(guildId) {
  isPlaying.set(guildId, false);
  const active = activeStreamCommand.get(guildId);
  if (active && active.browser) {
    try {
      await active.browser.close();
      console.log(`[WebRTC Automation] Google Chrome ditutup, streaming berhenti.`);
    } catch (e) {
      console.error("Gagal menutup browser:", e);
    }
  }
  activeStreamCommand.delete(guildId);
  return true;
}
