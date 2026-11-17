# Đập Chuột

Mini game phản xạ chạy trên trình duyệt: lưới 3×3, mỗi lượt 30 giây, đập trúng chuột để ghi điểm và nhân combo.

## Cấu trúc thư mục

| Thư mục / file | Nội dung |
|---|---|
| `app/` | Code game: `index.html`, `style.css`, `game.js` |
| `design/` | Design system: `tokens.css` và trang xem trước `design-system.html` |
| `docs/` | Tài liệu yêu cầu, chức năng, màn hình, quy tắc, kế hoạch test |
| `server/server.js` | Server Node.js nhỏ phục vụ game (dùng khi chạy bằng Docker) |
| `Dockerfile`, `docker-compose.yml` | Đóng gói và chạy bằng Docker |

## Cách chạy nhanh (không cần Docker)

Mở trực tiếp file `app/index.html` bằng trình duyệt. Thư mục `design/` phải nằm cạnh thư mục `app/`.

## Cách chạy bằng Docker

### Cần có

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) đã cài và **đang mở** (biểu tượng cá voi ở khay hệ thống báo *Engine running*).

### Chạy game

1. Mở terminal (PowerShell, Git Bash hoặc Terminal) tại thư mục gốc của dự án, nơi có file `docker-compose.yml`.
2. Build và khởi động:

   ```bash
   docker compose up -d --build
   ```

3. Mở trình duyệt vào **http://localhost:3000**

### Các lệnh thường dùng

| Việc cần làm | Lệnh |
|---|---|
| Xem trạng thái (cột STATUS phải là `healthy`) | `docker compose ps` |
| Xem log | `docker compose logs -f app` (thoát bằng Ctrl + C) |
| Dừng game | `docker compose down` |
| Chạy lại sau khi sửa code | `docker compose up -d --build` |

### Chế độ gỡ lỗi

Mở **http://localhost:3000/?debug=1** để hiện khung ghi lại từng con chuột (dùng khi test theo `docs/05-ke-hoach-test.html`).

### Gặp lỗi

- **`port is already allocated`** — cổng 3000 đang bị chương trình khác dùng. Tắt chương trình đó, hoặc đổi dòng `"3000:3000"` trong `docker-compose.yml` thành `"3001:3000"` rồi mở http://localhost:3001.
- **`Cannot connect to the Docker daemon`** hoặc **`error during connect`** — Docker Desktop chưa mở. Mở Docker Desktop, chờ báo *Engine running* rồi chạy lại lệnh.
- **Trang hiện nhưng không có màu** — kiểm tra thư mục `design/` vẫn còn trong dự án; server lấy `tokens.css` từ đó.
