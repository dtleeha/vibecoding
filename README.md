# Đập Chuột

Mini game phản xạ chạy trên trình duyệt: lưới 3×3, mỗi lượt 30 giây, đập trúng chuột để ghi điểm và nhân combo.

## Cấu trúc thư mục

| Thư mục / file | Nội dung |
|---|---|
| `app/` | Code game: `index.html`, `style.css`, `game.js` |
| `design/` | Design system: `tokens.css` và trang xem trước `design-system.html` |
| `docs/` | Tài liệu yêu cầu, chức năng, màn hình, quy tắc, kế hoạch test |
| `admin/` | Trang quản trị ở `/admin`: xem, tìm, xoá, xuất CSV người chơi; quản lý tài khoản admin |
| `server/` | Server Node.js: phục vụ game, API đăng ký/lưu điểm, API admin, kết nối PostgreSQL |
| `Dockerfile`, `docker-compose.yml` | Đóng gói và chạy bằng Docker (dịch vụ `app` + `db` PostgreSQL) |
| `.env.example` | Mẫu file `.env` (mật khẩu database và admin đầu tiên) |

## Cách chạy nhanh (không cần Docker)

Mở trực tiếp file `app/index.html` bằng trình duyệt chỉ để xem giao diện. **Đăng ký người chơi cần server và database**, nên mở kiểu này sẽ không đăng ký được (báo “Không kết nối được máy chủ”). Muốn chơi đầy đủ, hãy chạy bằng Docker như dưới đây.

## Cách chạy bằng Docker

### Cần có

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) đã cài và **đang mở** (biểu tượng cá voi ở khay hệ thống báo *Engine running*).

### Chuẩn bị file `.env` (chỉ làm một lần)

1. Chép file `.env.example` thành file mới tên `.env` (cùng thư mục).
2. Mở `.env`, đổi `POSTGRES_PASSWORD` thành một chuỗi dài ngẫu nhiên; điền `ADMIN_EMAIL` và `ADMIN_PASSWORD` (ít nhất 10 ký tự) cho tài khoản admin đầu tiên.
3. **Không** đưa file `.env` lên GitHub (đã có sẵn trong `.gitignore`).

Admin đầu tiên chỉ được tạo khi database **chưa có admin nào**. Sau đó đổi `ADMIN_PASSWORD` trong `.env` sẽ không còn tác dụng; đổi mật khẩu ngay trong trang admin.

### Chạy game

1. Mở terminal (PowerShell, Git Bash hoặc Terminal) tại thư mục gốc của dự án, nơi có file `docker-compose.yml`.
2. Build và khởi động:

   ```bash
   docker compose up -d --build
   ```

3. Mở trình duyệt:
   - Game: **http://localhost:3000**
   - Trang admin: **http://localhost:3000/admin** (đăng nhập bằng `ADMIN_EMAIL` / `ADMIN_PASSWORD`, rồi đặt mật khẩu mới)

Dữ liệu người chơi nằm trong volume Docker `pgdata`, nên vẫn còn sau khi `docker compose down` rồi chạy lại. Lệnh `docker compose down -v` sẽ **xoá hết dữ liệu**.

### Các lệnh thường dùng

| Việc cần làm | Lệnh |
|---|---|
| Xem trạng thái (cả `app` và `db` phải là `healthy`) | `docker compose ps` |
| Xem log | `docker compose logs -f app` (thoát bằng Ctrl + C) |
| Xem log database | `docker compose logs db` |
| Dừng game | `docker compose down` |
| Chạy lại sau khi sửa code | `docker compose up -d --build` |

### Chế độ gỡ lỗi

Mở **http://localhost:3000/?debug=1** để hiện khung ghi lại từng con chuột (dùng khi test theo `docs/05-ke-hoach-test.html`).

### Gặp lỗi

- **`port is already allocated`** — cổng 3000 đang bị chương trình khác dùng. Tắt chương trình đó, hoặc đổi dòng `"3000:3000"` trong `docker-compose.yml` thành `"3001:3000"` rồi mở http://localhost:3001.
- **`Cannot connect to the Docker daemon`** hoặc **`error during connect`** — Docker Desktop chưa mở. Mở Docker Desktop, chờ báo *Engine running* rồi chạy lại lệnh.
- **`Thiếu POSTGRES_PASSWORD trong file .env`** (hoặc biến khác) — chưa tạo file `.env`, hoặc file thiếu dòng đó. Xem mục “Chuẩn bị file `.env`”.
- **Đăng ký báo “Không kết nối được máy chủ”** — database chưa sẵn sàng. Chạy `docker compose ps` xem `db` có `healthy` không và `docker compose logs app` xem lỗi.
- **Không có admin để đăng nhập** — log của `app` có dòng `CẢNH BÁO: ... chưa tạo admin đầu tiên`: kiểm tra `ADMIN_EMAIL`, `ADMIN_PASSWORD` trong `.env` rồi chạy lại `docker compose up -d`.
- **Trang hiện nhưng không có màu** — kiểm tra thư mục `design/` vẫn còn trong dự án; server lấy `tokens.css` từ đó.
