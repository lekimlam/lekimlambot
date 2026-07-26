const express = require('express');
const login = require("fca-project-origen");
const fs = require("fs");
const axios = require("axios");

// Tạo web server để giữ bot online trên Render
const app = express();
app.get('/', (req, res) => res.send('Bot đang chạy ngon lành!'));
app.listen(process.env.PORT || 3000, () => console.log('Web server đang mở...'));

// Đọc cookie
let appState;
try {
    appState = JSON.parse(fs.readFileSync("appstate.json", "utf8"));
} catch (e) {
    console.error("Lỗi: Không tìm thấy file appstate.json");
    process.exit(1);
}

const cooldowns = new Map();
const COOLDOWN_TIME = 10; // 10 giây chờ

login({ appState }, (err, api) => {
  if (err) return console.error("Lỗi đăng nhập (Cookie die hoặc bị block):", err);
  
  api.setOptions({ listenEvents: true, selfListen: false });
  console.log("=== USER BOT ĐÃ SẴN SÀNG ===");

  api.listenMqtt(async (err, event) => {
    if (err) return console.error("Lỗi MQTT:", err);
    
    if (event.type === "message" || event.type === "message_reply") {
      const msg = event.body ? event.body.toLowerCase() : "";
      const threadID = event.threadID;
      const senderID = event.senderID;

      // 1. Lệnh #menu
      if (msg === "#menu") {
        return api.sendMessage("=== 🤖 MENU BOT ===\n1. #menu: Xem lệnh\n2. #ask <câu hỏi>: Hỏi AI\n(Chờ 10s mỗi lần hỏi)", threadID);
      }

      // 2. Lệnh #ask (Hỏi AI)
      if (msg.startsWith("#ask ")) {
        const userQuery = event.body.slice(5).trim();
        if (!userQuery) return api.sendMessage("Bạn chưa nhập câu hỏi kìa!", threadID);

        // Kiểm tra 10 giây
        const now = Date.now();
        if (cooldowns.has(senderID)) {
          const timePassed = (now - cooldowns.get(senderID)) / 1000;
          if (timePassed < COOLDOWN_TIME) {
            return api.sendMessage(`⏳ Từ từ thôi bạn ơi, đợi ${(COOLDOWN_TIME - timePassed).toFixed(1)}s nữa nha!`, threadID);
          }
        }
        cooldowns.set(senderID, now);

        api.sendMessage("🧠 AI đang nghĩ, đợi chút...", threadID);
        try {
          // SAU NÀY BẠN THAY LINK API AI VÀO ĐÂY, HIỆN TẠI LÀ CÂU TRẢ LỜI MẪU
          const aiAnswer = `🤖 AI trả lời: "${userQuery}"\n(Code đã chạy thành công, hãy gắn API AI thật vào nhé!)`;
          api.sendMessage(aiAnswer, threadID);
        } catch (error) {
          api.sendMessage("❌ Lỗi AI mất rồi!", threadID);
        }
      }
    }
  });
});
