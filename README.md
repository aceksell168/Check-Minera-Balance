MineraPay Balances Dashboard
===========================

Ringkasan
--------
Proyek kecil ini menyediakan dua cara untuk mengambil `Active Balance` dan `Pending Balance` dari Backoffice MineraPay:

- Bookmarklet / Console: jalankan skrip langsung di halaman Backoffice setelah Anda login. Skrip men-scrape DOM dan menampilkan widget kecil.
- API: jika Anda punya endpoint API dan token (atau endpoint yang mengizinkan CORS), masukkan URL dan header Authorization di form, lalu klik "Ambil Balances".

File
----
- `index.html` - UI dashboard statis.
- `app.js` - logika fetch, helper, dan tombol salin.

Cara pakai — Bookmarklet / Console (direkomendasikan saat sudah login)
---------------------------------------------------------------
1. Login ke https://backoffice.minerapay.com/ pada browser Anda.
2. Buka DevTools → Console.
3. Copy script dari kotak "Bookmarklet / Console" pada `index.html` atau buka file lalu copy, lalu paste ke Console dan Enter.
4. Widget kecil akan muncul di pojok kanan atas yang menampilkan nilai aktif/tertunda.

Anda juga bisa membuat bookmarklet dari script tersebut (encode URI dan simpan sebagai bookmark URL).

Cara pakai — API (jika Anda punya endpoint + token)
-------------------------------------------------
1. Isi `Endpoint API` pada halaman `index.html` dengan URL endpoint yang mengembalikan JSON.
2. Jika API memerlukan header Authorization, masukkan value (mis. `Bearer <token>`).
3. Isi path ke field `Active` dan `Pending` jika struktur JSON bukan standar (gunakan dot notation, mis. `data.summary.active_balance`).
4. Klik `Ambil Balances`.

Catatan teknis
-------------
- Jika API hanya menerima session cookie, aplikasi statis ini TIDAK bisa menyet cookie pada fetch karena pembatasan browser. Untuk kasus cookie-based session:
  - Jalankan skrip bookmarklet di halaman Backoffice (ini dijalankan di konteks yang sama sehingga dapat membaca DOM).
  - Atau host file `index.html` di domain yang sama (butuh akses server/backoffice config).

- Jika Anda akan mengotomasi, lebih baik gunakan endpoint JSON yang digunakan frontend (lihat DevTools → Network → XHR saat memuat Dashboard) dan gunakan token atau API key.

Butuh bantuan lebih lanjut?
-------------------------
- Jika Anda paste response JSON dari endpoint dashboard (hasil copy dari Network → Response), saya akan bantu tentukan `path` yang tepat dan contoh `curl`.
- Mau saya buatkan versi kecil server-proxy (node/express) untuk meneruskan cookie dan mengambil data? Beri tahu preferensi Anda.
