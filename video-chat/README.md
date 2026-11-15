# video-chat: video TikTok 9:16 kiểu đọc tin nhắn
1. Viết kịch bản `scripts/ten.txt` (cú pháp bên dưới).
2. `./make.sh scripts/ten.txt` -> tạo giọng VieNeu trên GitHub Actions (chỉ dòng mới), kéo về, dựng ra `out2/<id>.mp4` + `.srt`.
Cần: ffmpeg, playwright chromium, font Inter, thư mục `products/` (ảnh sản phẩm), `MEME_DIR` (thư mục meme; mặc định /home/claude/memezip/MEME), `gh` đăng nhập.
Tuỳ chọn: `VOICE_SPEED` (mặc định 1.3).
## Cú pháp kịch bản
```
== id | Tiêu đề
-- chat | TIÊU ĐỀ POSTER | 22:03 | Tên liên hệ | light/dark | Caption | F1M1
a: tin nhắn người 1 (bên trái)      b: tin nhắn người 2 (bên phải)
a: IMG:tenanh                       (gửi ảnh products/tenanh.*)
-- meme | file trong MEME_DIR | chữ phản ứng | ss | dur | green(1/0) | vol
-- product | Tên | Nhãn giỏ hàng | tenanh
vo: lời dẫn cảnh sản phẩm
```
Cặp giọng (mã 4 ký tự): F1=Ngọc Huyền, F2=Trúc Ly (nữ), M1=Phạm Tuyên, M2=Hải Đăng (nam); ví dụ F1F2 (2 nữ), M1M2 (2 nam), F1M1 (nữ-nam). Sửa trong voices.json.
Mỗi meme xen giữa 2 cuộc hội thoại độc lập; chat nào cũng có thể là câu chuyện riêng.
