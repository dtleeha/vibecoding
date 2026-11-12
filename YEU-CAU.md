# YÊU CẦU — Mini game "Đập Chuột" (chạy trên trình duyệt)

> Tài liệu mô tả yêu cầu, **chưa bao gồm code**.
> Những mục đánh dấu *(giả định)* là chi tiết chưa được chốt — giữ nguyên nếu không có yêu cầu khác, hoặc chỉnh trước khi bắt đầu code.

---

## 1. Tổng quan

| Hạng mục | Mô tả |
|---|---|
| Thể loại | Game phản xạ, 1 người chơi |
| Nền tảng | Trình duyệt web (máy tính và điện thoại) |
| Bàn chơi | Lưới 3×3 = 9 ô (hang chuột) |
| Thời lượng 1 lượt | 30 giây |
| Mục tiêu | Đập trúng càng nhiều chuột càng tốt trong 30 giây |

---

## 2. Luật chơi

1. Người chơi bấm **"Bắt đầu"** để vào lượt chơi. Đồng hồ 30 giây bắt đầu đếm ngược ngay lập tức.
2. Trong lượt chơi, chuột lần lượt **ngoi lên ngẫu nhiên** ở một trong 9 ô.
3. **Mỗi thời điểm chỉ có tối đa 1 con chuột** trên bàn. *(giả định)*
4. Mỗi con chuột ở trên bàn trong khoảng **0,6 – 1,2 giây** (ngẫu nhiên), rồi tự lặn xuống nếu không bị đập. *(giả định)*
5. Con chuột tiếp theo xuất hiện sau khoảng nghỉ ngắn **0,2 – 0,5 giây**, và **không xuất hiện lại đúng ô vừa rồi** để tránh lặp. *(giả định)*
6. Người chơi bấm (click chuột hoặc chạm trên điện thoại) vào ô có chuột để **đập**.
7. Con chuột bị đập trúng sẽ biến mất ngay; một con mới xuất hiện theo nhịp ở mục 5.
8. Khi đồng hồ về **0**, lượt chơi kết thúc ngay lập tức: chuột đang trên bàn biến mất, mọi cú bấm sau đó không được tính.
9. Người chơi có thể bấm **"Chơi lại"** để bắt đầu lượt mới; điểm và đồng hồ được đặt lại từ đầu.

---

## 3. Cách tính điểm

| Hành động | Điểm |
|---|---|
| Bấm trúng ô **đang có chuột** | **+1** |
| Bấm vào ô trống (trượt) | 0 — không trừ điểm *(giả định)* |
| Chuột tự lặn xuống mà không bị đập | 0 — không trừ điểm |

Quy tắc bổ sung:

- **Mỗi con chuột chỉ tính điểm 1 lần.** Bấm liên tục nhiều lần vào cùng một con (double-click, chạm nhanh) vẫn chỉ được +1.
- Điểm bắt đầu từ **0** ở mỗi lượt.
- Điểm không thể âm.
- **Kỷ lục (điểm cao nhất)** được lưu trên trình duyệt của người chơi, vẫn còn sau khi tải lại trang. *(giả định)*

---

## 4. Màn hình

Game gồm 3 trạng thái màn hình, nằm trên cùng một trang.

### 4.1. Màn hình Bắt đầu

- Tên game: **"Đập Chuột"**.
- Tóm tắt luật chơi trong 1–2 dòng (VD: "Đập trúng chuột được 1 điểm. Bạn có 30 giây!").
- Hiển thị **kỷ lục** hiện tại (nếu chưa có thì hiện 0).
- Nút **"Bắt đầu"**.

### 4.2. Màn hình Đang chơi

- **Thanh thông tin** phía trên lưới:
  - **Điểm** hiện tại.
  - **Thời gian còn lại** (đếm ngược theo giây, từ 30 về 0).
  - *(giả định)* Đồng hồ đổi sang màu cảnh báo (VD: đỏ) khi còn **≤ 5 giây**.
- **Lưới 3×3** ở giữa màn hình:
  - 9 ô có kích thước bằng nhau, khoảng cách đều.
  - Ô trống: hiển thị hang/lỗ.
  - Ô có chuột: hiển thị hình chuột ngoi lên khỏi hang.
- **Phản hồi khi đập trúng**: hiệu ứng ngắn (VD: chuột "bẹp", hiện chữ "+1") để người chơi biết đã ghi điểm.
- *(giả định)* Con trỏ chuột trên máy tính có thể hiển thị dạng cái búa.

### 4.3. Màn hình Kết thúc

- Thông báo **"Hết giờ!"**.
- **Điểm** của lượt vừa chơi.
- **Kỷ lục**; nếu lượt này phá kỷ lục thì hiện thêm dòng chúc mừng (VD: "Kỷ lục mới!").
- Nút **"Chơi lại"**.

### 4.4. Yêu cầu chung về giao diện

- **Responsive**: chơi được trên màn hình điện thoại dọc (từ khoảng 360px chiều ngang) đến màn hình máy tính.
- Lưới luôn **vuông**, nằm trọn trong màn hình, không cần cuộn trang khi chơi.
- Ô đủ lớn để chạm bằng ngón tay (tối thiểu khoảng 80×80px trên điện thoại).
- Chạm trên điện thoại **không bị zoom, không chọn chữ, không bị cuộn trang**.
- Toàn bộ chữ trong game bằng **tiếng Việt**.

---

## 5. Tiêu chí hoàn thành

Game được xem là hoàn thành khi **đạt hết** các mục dưới đây.

### 5.1. Chức năng

- [ ] Mở file/trang trên trình duyệt là hiện màn hình Bắt đầu, không báo lỗi.
- [ ] Bấm "Bắt đầu" → chuyển sang màn hình Đang chơi, điểm = 0, đồng hồ = 30.
- [ ] Lưới hiển thị đúng **9 ô**, bố cục **3 hàng × 3 cột**.
- [ ] Chuột xuất hiện ngẫu nhiên ở các ô; sau một lượt chơi, chuột đã xuất hiện ở nhiều ô khác nhau.
- [ ] Mỗi thời điểm có tối đa 1 con chuột trên bàn.
- [ ] Bấm trúng chuột → điểm **tăng đúng 1**, chuột biến mất.
- [ ] Bấm nhanh nhiều lần vào cùng 1 con chuột → điểm chỉ tăng **1**.
- [ ] Bấm vào ô trống → điểm **không đổi**.
- [ ] Đồng hồ đếm ngược đúng **30 giây** so với đồng hồ thật (sai lệch không quá ±0,5 giây).
- [ ] Hết giờ → chuột ngừng xuất hiện, bấm vào lưới không được tính điểm, chuyển sang màn hình Kết thúc.
- [ ] Màn hình Kết thúc hiển thị đúng điểm của lượt vừa chơi.
- [ ] Bấm "Chơi lại" → điểm về 0, đồng hồ về 30, lượt mới chạy bình thường.
- [ ] Chơi lại liên tiếp **nhiều lượt** (ít nhất 5 lượt) mà game không chạy nhanh dần, không xuất hiện 2 con chuột cùng lúc, đồng hồ không bị trừ 2 lần mỗi giây.
- [ ] Kỷ lục được cập nhật khi điểm lượt mới cao hơn, và vẫn còn sau khi tải lại trang.

### 5.2. Tương thích

- [ ] Chạy đúng trên **Chrome**, **Edge** (máy tính) và **Safari / Chrome** trên điện thoại.
- [ ] Chơi được bằng **chuột** (máy tính) và bằng **chạm** (điện thoại).
- [ ] Hiển thị đầy đủ, không cần cuộn, ở chiều ngang từ 360px trở lên.

### 5.3. Kỹ thuật

- [ ] Chạy được bằng cách mở trực tiếp file `index.html`, **không cần cài đặt hoặc server**. *(giả định)*
- [ ] Không có lỗi trong Console của trình duyệt khi chơi.
- [ ] Không phụ thuộc thư viện/tài nguyên phải tải từ Internet để chơi được. *(giả định)*

---

## 6. Ngoài phạm vi (phiên bản này chưa làm)

- Nhiều mức độ khó, hoặc chuột nhanh dần theo thời gian.
- Nhiều loại chuột (chuột vàng nhiều điểm, bom trừ điểm…).
- Âm thanh, nhạc nền.
- Bảng xếp hạng online, đăng nhập, nhiều người chơi.
- Tạm dừng giữa lượt.
