const express = require('express');
const login = require("fca-project-origen");
const fs = require("fs");
const axios = require("axios");
const path = require("path");

// ====================================================
// 🔑 CẤU HÌNH API KEY (Thay API Key Gemini của bạn vào đây)
// Lấy key miễn phí tại: https://aistudio.google.com/
// ====================================================
const GEMINI_API_KEY = "DÁN_API_KEY_GEMINI_CỦA_BẠN_VÀO_ĐÂY";


// --- 1. TẠO WEB SERVER (Giúp Render & UptimeRobot giữ bot 24/7) ---
const app = express();
app.get('/', (req, res) => res.send('Bot Facebook AI FULL đang hoạt động 24/7!'));
app.listen(process.env.PORT || 3000, () => console.log('Web Server đã sẵn sàng...'));


// --- 2. TẠO THƯ MỤC TẠM (DÙNG CHO TÍNH NĂNG AI VẼ ẢNH) ---
const cacheDir = path.join(__dirname, "cache");
if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir);
}


// --- 3. ĐỌC COOKIE TỪ APPSTATE.JSON ---
let appState;
try {
    appState = JSON.parse(fs.readFileSync("appstate.json", "utf8"));
} catch (e) {
    console.error("❌ LỖI: Không tìm thấy hoặc lỗi file appstate.json!");
    process.exit(1);
}


// --- 4. CẤU HÌNH THỜI GIAN CHỜ (COOLDOWN 10 GIÂY) ---
const cooldowns = new Map();
const COOLDOWN_TIME = 10; // Tính bằng giây


// --- 5. ĐĂNG NHẬP VÀ XỬ LÝ LỆNH ---
login({ appState }, (err, api) => {
  if (err) return console.error("❌ Lỗi đăng nhập Facebook (Cookie die hoặc bị Checkpoint):", err);

  api.setOptions({
    listenEvents: true,
    selfListen: false // Không tự trả lời tin nhắn của chính mình
  });

  console.log("==================================================");
  console.log("🤖 USER BOT FACEBOOK FULL TÍNH NĂNG ĐÃ SẴN SÀNG!");
  console.log("==================================================");

  api.listenMqtt(async (err, event) => {
    if (err) return console.error("Lỗi MQTT:", err);

    // Chỉ xử lý tin nhắn cá nhân hoặc tin nhắn nhóm
    if (event.type === "message" || event.type === "message_reply") {
      const msg = event.body ? event.body.toLowerCase().trim() : "";
      const threadID = event.threadID;
      const senderID = event.senderID;

      // ------------------------------------------------
      // LỆNH 1: #MENU (DANH SÁCH LỆNH)
      // ------------------------------------------------
      if (msg === "#menu") {
        const menuText =
          "=== 🤖 MENU BOT AI FULL TIỆN ÍCH ===\n\n" +
          "1. #ask <câu hỏi> : Hỏi đáp cùng AI Gemini\n" +
          "2. #ve <mô tả> : AI vẽ tranh từ văn bản\n" +
          "3. #boi <câu hỏi> : Thầy bói AI phán quẻ\n" +
          "4. #code <yêu cầu> : AI chuyên gia viết code\n" +
          "5. #dich <văn bản> : Dịch sang tiếng Việt\n" +
          "6. #thoitiet <tên TP> : Xem thời tiết địa phương\n" +
          "7. #uid : Lấy ID Facebook cá nhân\n" +
          "8. #tid : Lấy ID nhóm chat này\n" +
          "9. #out : Cho bot rời khỏi nhóm\n\n" +
          "📌 Lưu ý: Các lệnh AI phải chờ 10s mỗi lần dùng.";
        return api.sendMessage(menuText, threadID);
      }

      // ------------------------------------------------
      // LỆNH 2: #ASK (HỎI AI GEMINI)
      // ------------------------------------------------
      if (msg.startsWith("#ask ")) {
        const userQuery = event.body.slice(5).trim();
        if (!userQuery) return api.sendMessage("⚠️ Bạn chưa nhập nội dung câu hỏi!", threadID);

        if (checkCooldown(senderID, api, threadID)) return;

        api.sendMessage("🧠 AI đang suy nghĩ, chờ chút nhé...", threadID);
        try {
          const answer = await callGeminiAPI(`Trả lời ngắn gọn, chuẩn xác: ${userQuery}`);
          api.sendMessage(`🤖 Gemini trả lời:\n\n${answer}`, threadID);
        } catch (e) {
          api.sendMessage("❌ Lỗi kết nối với AI Gemini! Kiểm tra API Key.", threadID);
        }
      }

      // ------------------------------------------------
      // LỆNH 3: #VE (AI VẼ TRANH MIỄN PHÍ)
      // ------------------------------------------------
      if (msg.startsWith("#ve ")) {
        const prompt = event.body.slice(4).trim();
        if (!prompt) return api.sendMessage("⚠️ Nhập mô tả bức ảnh bạn muốn vẽ!", threadID);

        api.sendMessage("🎨 AI đang vẽ tranh, đợi vài giây nha...", threadID);
        try {
          const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?nologo=true`;
          const imagePath = path.join(cacheDir, `draw_${Date.now()}.png`);

          const response = await axios({
            url: imageUrl,
            method: "GET",
            responseType: "stream"
          });

          const writer = fs.createWriteStream(imagePath);
          response.data.pipe(writer);

          writer.on("finish", () => {
            api.sendMessage({
              body: `🎨 Bức ảnh vẽ theo yêu cầu: "${prompt}"`,
              attachment: fs.createReadStream(imagePath)
            }, threadID, () => {
              if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath); // Gửi xong xóa ảnh tạm
            });
          });
        } catch (e) {
          console.error(e);
          api.sendMessage("❌ Lỗi khi AI vẽ tranh!", threadID);
        }
      }

      // ------------------------------------------------
      // LỆNH 4: #BOI (THẦY BÓI AI HÀI HƯỚC)
      // ------------------------------------------------
      if (msg.startsWith("#boi ")) {
        const question = event.body.slice(5).trim();
        if (!question) return api.sendMessage("⚠️ Nhập câu hỏi bạn muốn xem bói!", threadID);

        if (checkCooldown(senderID, api, threadID)) return;

        api.sendMessage("🔮 Thầy đang gieo quẻ, chờ chút...", threadID);
        try {
          const prompt = `Bạn là một thầy bói hài hước, phán xéo sắc, vui tính. Hãy bói cho câu hỏi này: "${question}"`;
          const answer = await callGeminiAPI(prompt);
          api.sendMessage(`🔮 **THẦY BÓI AI PHÁN:**\n\n${answer}`, threadID);
        } catch (e) {
          api.sendMessage("❌ Thầy bói đang đi ngủ, quay lại sau!", threadID);
        }
      }

      // ------------------------------------------------
      // LỆNH 5: #CODE (AI HỖ TRỢ LẬP TRÌNH)
      // ------------------------------------------------
      if (msg.startsWith("#code ")) {
        const codeQuery = event.body.slice(6).trim();
        if (!codeQuery) return api.sendMessage("⚠️ Nhập yêu cầu viết hoặc sửa code!", threadID);

        if (checkCooldown(senderID, api, threadID)) return;

        api.sendMessage("💻 Chuyên gia Lập Trình AI đang gõ code...", threadID);
        try {
          const prompt = `Bạn là một lập trình viên cao cấp. Hãy giải thích ngắn gọn và viết đoạn mã chính xác cho yêu cầu: "${codeQuery}"`;
          const answer = await callGeminiAPI(prompt);
          api.sendMessage(`💻 **CODE DÀNH CHO BẠN:**\n\n${answer}`, threadID);
        } catch (e) {
          api.sendMessage("❌ Lỗi khi nhờ AI viết code!", threadID);
        }
      }

      // ------------------------------------------------
      // LỆNH 6: #DICH (DỊCH TIẾNG VIỆT)
      // ------------------------------------------------
      if (msg.startsWith("#dich ")) {
        const textToTranslate = event.body.slice(6).trim();
        if (!textToTranslate) return api.sendMessage("⚠️ Nhập nội dung cần dịch!", threadID);

        try {
          const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(textToTranslate)}`;
          const res = await axios.get(url);
          const translation = res.data[0][0][0];
          api.sendMessage(`🌐 Dịch sang Tiếng Việt:\n👉 ${translation}`, threadID);
        } catch (e) {
          api.sendMessage("❌ Lỗi dịch thuật!", threadID);
        }
      }

      // ------------------------------------------------
      // LỆNH 7: #THOITIET (XEM THỜI TIẾT)
      // ------------------------------------------------
      if (msg.startsWith("#thoitiet ")) {
        const city = event.body.slice(10).trim();
        if (!city) return api.sendMessage("⚠️ Nhập tên thành phố (VD: #thoitiet hanoi)", threadID);

        try {
          const res = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=3`);
          api.sendMessage(`☀️ Thời tiết hiện tại:\n${res.data}`, threadID);
        } catch (e) {
          api.sendMessage("❌ Không tìm thấy thông tin thời tiết địa điểm này!", threadID);
        }
      }

      // ------------------------------------------------
      // LỆNH 8 & 9: LẤY ID (#UID, #TID)
      // ------------------------------------------------
      if (msg === "#uid") return api.sendMessage(`🆔 ID Facebook của bạn: ${senderID}`, threadID);
      if (msg === "#tid") return api.sendMessage(`🆔 ID Nhóm chat này: ${threadID}`, threadID);

      // ------------------------------------------------
      // LỆNH 10: RỜI NHÓM (#OUT)
      // ------------------------------------------------
      if (msg === "#out") {
        api.sendMessage("👋 Tạm biệt mọi người, bot rời nhóm đây!", threadID, () => {
          api.removeUserFromGroup(api.getCurrentUserID(), threadID);
        });
      }

    }
  });
});


// ====================================================
// --- HÀM BỔ TRỢ 1: GỌI GOOGLE GEMINI API ---
// ====================================================
async function callGeminiAPI(promptText) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === "AQ.Ab8RN6LP9nRg8noazP_ET88fL5tL8A557dN1GRfgkuhTdGxRoQ") {
    throw new Error("Chưa cài Gemini API Key vào file index.js");
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const response = await axios.post(url, {
    contents: [{ parts: [{ text: promptText }] }]
  });
  return response.data.candidates[0].content.parts[0].text;
}


// ====================================================
// --- HÀM BỔ TRỢ 2: KIỂM TRA COOLDOWN 10S CHỐNG SPAM ---
// ====================================================
function checkCooldown(senderID, api, threadID) {
  const now = Date.now();
  if (cooldowns.has(senderID)) {
    const timePassed = (now - cooldowns.get(senderID)) / 1000;
    if (timePassed < COOLDOWN_TIME) {
      const timeLeft = (COOLDOWN_TIME - timePassed).toFixed(1);
      api.sendMessage(`⏳ Từ từ thôi bạn ơi, đợi ${timeLeft}s nữa rồi dùng tiếp nha!`, threadID);
      return true; // Bị vướng Cooldown
    }
  }
  cooldowns.set(senderID, now);
  return false; // Được phép dùng
      }
