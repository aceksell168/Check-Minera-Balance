const API_URL = 'https://check-minera-balance.onrender.com';
let authToken = null;
let currentUser = null;
let currentWithdrawData = [];
let currentWithdrawDataAll = [];
let rawVisible = false;
let autoRefreshTimer = null;
let lastWithdrawIds = new Set();
let autoCheckEnabled = false;
let mockMode = false; // Fallback mode jika backend tidak tersedia

// Mock data untuk development
const MOCK_USERS = [
  { id: 1, username: 'rendy', password: 'asd123', role: 'admin', fullName: 'Rendy' },
  { id: 2, username: 'fendi', password: 'asd123', role: 'admin', fullName: 'Fendi' },
  { id: 3, username: 'navin', password: 'asd123', role: 'user', fullName: 'Navin' },
  { id: 4, username: 'ridwan', password: 'asd123', role: 'user', fullName: 'Ridwan' },
  { id: 5, username: 'joni', password: 'asd123', role: 'user', fullName: 'Joni' }
];
let mockHistory = [];

// ============= AUTH FUNCTIONS =============
async function handleLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  
  if (!username || !password) {
    alert('Username dan password harus diisi');
    return;
  }
  
  // Try backend first
  try {
    const response = await Promise.race([
      fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
    ]);
    
    const data = await response.json();
    if (data.token) {
      authToken = data.token;
      currentUser = data.user;
      localStorage.setItem('authToken', authToken);
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      mockMode = false;
      showMainApp();
      loadHistory();
      return;
    }
  } catch (err) {
    console.warn('Backend not available, using mock mode:', err.message);
    mockMode = true;
  }
  
  // Fallback to mock authentication
  const user = MOCK_USERS.find(u => u.username === username && u.password === password);
  if (user) {
    authToken = 'mock_token_' + Math.random();
    currentUser = { id: user.id, username: user.username, role: user.role, fullName: user.fullName };
    localStorage.setItem('authToken', authToken);
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    mockMode = true;
    showMainApp();
    loadHistory();
    showToast('ℹ️ Menggunakan mode offline (backend tidak tersedia)', 'info');
  } else {
    alert('❌ Username atau password salah');
  }
}

function handleLogout() {
  if (confirm('Yakin logout?')) {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    location.reload();
  }
}

function showMainApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('mainApp').style.display = 'flex';
  document.getElementById('sidebarUsername').textContent = currentUser.fullName;
  document.getElementById('sidebarUserRole').textContent = currentUser.role.toUpperCase();
  
  if (currentUser.role === 'admin') {
    document.getElementById('adminHistoryControls').style.display = 'block';
  }
  
  loadSettings();
  fetchBalances();
  scheduleAutoRefresh(Number(document.getElementById('refreshInterval')?.value) || 600);
}

function showChangePasswordModal() {
  document.getElementById('changePasswordModal').classList.add('show');
  document.getElementById('oldPassword').value = '';
  document.getElementById('newPassword').value = '';
  document.getElementById('confirmPassword').value = '';
}

function hideChangePasswordModal() {
  document.getElementById('changePasswordModal').classList.remove('show');
}

function handleChangePassword() {
  const oldPassword = document.getElementById('oldPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  
  if (!oldPassword || !newPassword) {
    alert('Semua field harus diisi');
    return;
  }
  
  if (newPassword !== confirmPassword) {
    alert('Password baru tidak cocok');
    return;
  }
  
  if (mockMode) {
    showToast('✓ Password berhasil diubah (mock)', 'success');
    hideChangePasswordModal();
    return;
  }
  
  fetch(`${API_URL}/auth/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({ oldPassword, newPassword })
  })
  .then(r => r.json())
  .then(data => {
    if (data.message) {
      showToast('✓ Password berhasil diubah', 'success');
      hideChangePasswordModal();
    } else {
      showToast('❌ ' + (data.message || 'Gagal mengubah password'), 'error');
    }
  })
  .catch(err => showToast('❌ Error: ' + err.message, 'error'));
}

function loadHistory() {
  if (mockMode) {
    renderHistory(mockHistory);
    return;
  }
  
  fetch(`${API_URL}/history`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  })
  .then(r => r.json())
  .then(data => {
    renderHistory(data);
  })
  .catch(err => console.error('Error loading history:', err));
}

function renderHistory(historyItems) {
  const historyList = document.getElementById('historyList');
  if (!historyItems || historyItems.length === 0) {
    historyList.innerHTML = '<div class="small" style="text-align:center;color:var(--muted);padding:24px">📭 Belum ada history</div>';
    return;
  }
  
  let html = '';
  for (const item of historyItems.slice(0, 50)) {
    const time = new Date(item.timestamp).toLocaleString('id-ID');
    const isKlop = item.reconcileStatus === '✓ KLOP';
    const badgeClass = isKlop ? 'status-klop' : 'status-error';
    const badge = `<span class="status-badge ${badgeClass}">${item.reconcileStatus}</span>`;
    
    html += `
      <div class="history-item ${isKlop ? 'success-row' : 'error-row'}">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div class="history-username">${item.fullName} <span style="font-size:11px;opacity:0.6">(${item.role})</span></div>
            <div class="history-time">${time}</div>
          </div>
          ${badge}
        </div>
        <div class="history-status" style="margin-top:6px;font-size:12px;color:var(--muted)">
          Selisih: ${formatNumber(Math.abs(item.difference))}
        </div>
      </div>
    `;
  }
  historyList.innerHTML = html;
}

function clearAllHistory() {
  if (!confirm('Hapus semua history? Ini tidak bisa dibatalkan.')) return;
  
  if (mockMode) {
    mockHistory = [];
    showToast('✓ History berhasil dihapus (mock)', 'success');
    loadHistory();
    return;
  }
  
  fetch(`${API_URL}/admin/history`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${authToken}` }
  })
  .then(r => r.json())
  .then(data => {
    showToast('✓ History berhasil dihapus', 'success');
    loadHistory();
  })
  .catch(err => showToast('❌ Error: ' + err.message, 'error'));
}

function setupAutoCheckToggle() {
  const toggle = document.getElementById('autoCheckToggle');
  toggle.addEventListener('change', () => {
    autoCheckEnabled = toggle.checked;
    localStorage.setItem('autoCheckEnabled', autoCheckEnabled);
    if (autoCheckEnabled) {
      showToast('✓ Auto-check diaktifkan', 'success');
      scheduleAutoCheck();
    } else {
      showToast('✓ Auto-check dimatikan', 'info');
    }
  });
  
  const saved = localStorage.getItem('autoCheckEnabled');
  if (saved === 'true') {
    toggle.checked = true;
    autoCheckEnabled = true;
    scheduleAutoCheck();
  }
}

let autoCheckTimer = null;
function scheduleAutoCheck() {
  if (autoCheckTimer) clearInterval(autoCheckTimer);
  if (!autoCheckEnabled) return;
  autoCheckTimer = setInterval(() => {
    fetchBalances();
  }, 10 * 60 * 1000);
}

function formatNumber(num){
  if(num === null || num === undefined || isNaN(num)) return '0';
  return Math.floor(num).toLocaleString('en-US');
}

function normalizeValue(value){
  if(value === undefined || value === null || value === '') return '-';
  if(typeof value === 'object'){
    if(Array.isArray(value)) return value.map(normalizeValue).join(', ') || '-';
    const preferred = ['name','fullName','fullname','username','email','label','bankName','bank_name','accountName','account_name','bank_account','account_number','owner_name','beneficiary_name','beneficiaryName','merchant','customerName','user_name','reference','ref'];
    for(const key of preferred){
      if(value[key]) return normalizeValue(value[key]);
    }
    const flattened = Object.values(value).map(normalizeValue).filter(v=>v !== '-');
    return flattened.length ? flattened.join(' / ') : '-';
  }
  return String(value);
}

function formatDate(value){
  if(!value && value !== 0) return '-';
  const date = new Date(value);
  if(!isNaN(date.getTime())){
    return date.toLocaleString('id-ID', { year:'numeric', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' });
  }
  return normalizeValue(value);
}

function normalizeStatus(status){
  const s = String(status||'').trim().toLowerCase();
  if(/success|sukses|done|completed|selesai/.test(s)) return 'success';
  if(/pending|menunggu|waiting/.test(s)) return 'pending';
  return s || 'other';
}

function getField(item, keys){
  for(const key of keys){
    const value = get(item, key);
    if(value !== undefined && value !== null && value !== '') return normalizeValue(value);
  }
  return '-';
}

function showPopup(message){
  const modal = document.getElementById('popupModal');
  const msg = document.getElementById('popupMessage');
  if(modal && msg){
    msg.textContent = message;
    modal.classList.add('show');
  } else {
    alert(message);
  }
}

function hidePopup(){
  const modal = document.getElementById('popupModal');
  if(modal) modal.classList.remove('show');
}

function showToast(message, type = 'info'){
  const container = document.getElementById('toastContainer');
  if(!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(()=>{
    toast.style.opacity = '0';
    setTimeout(()=>toast.remove(), 500);
  }, 4000);
}

function scheduleAutoRefresh(seconds){
  if(autoRefreshTimer) clearInterval(autoRefreshTimer);
  if(!seconds || Number(seconds) <= 0) return;
  autoRefreshTimer = setInterval(fetchBalances, Number(seconds) * 1000);
}

function applyStatusFilter(){
  const filter = document.getElementById('statusFilter')?.value || 'all';
  const filtered = currentWithdrawDataAll.filter(item => {
    if(filter === 'all') return true;
    return normalizeStatus(item.status) === filter;
  });
  currentWithdrawData = filtered;
  let sumAmount = 0, sumFee = 0, count = 0, sumAmountGT = 0, sumAmountLT = 0, countGT = 0, countLT = 0;
  for(const it of filtered){
    sumAmount += Number(it.amount || 0);
    sumFee += Number(it.fee || 0);
    count += 1;
    if(Number(it.amount) > 10000000){ sumAmountGT += Number(it.amount); countGT += 1; }
    else { sumAmountLT += Number(it.amount); countLT += 1; }
  }
  document.getElementById('wd-count').textContent = count;
  document.getElementById('wd-amount').textContent = formatNumber(sumAmount);
  document.getElementById('wd-fee').textContent = formatNumber(sumFee);
  document.getElementById('wd-amountgt').textContent = `${formatNumber(sumAmountGT)} (${countGT})`;
  document.getElementById('wd-amountlt').textContent = `${formatNumber(sumAmountLT)} (${countLT})`;
  renderWithdrawTable(filtered);
}

function copyToClipboard(text){
  navigator.clipboard?.writeText(text).then(()=>alert('✓ Disalin ke clipboard'),()=>alert('✗ Gagal menyalin'));
}

function get(obj, path){
  if(!path) return obj;
  return path.split('.').reduce((o,p)=>o && o[p], obj);
}

function findArrayPaths(obj, prefix = ''){
  const paths = [];
  if(Array.isArray(obj)){
    paths.push(prefix || 'root');
    return paths;
  }
  if(typeof obj !== 'object' || obj === null) return paths;
  for(const key of Object.keys(obj)){
    const value = obj[key];
    const currentPath = prefix ? `${prefix}.${key}` : key;
    if(Array.isArray(value)) paths.push(currentPath);
    if(typeof value === 'object' && value !== null) paths.push(...findArrayPaths(value, currentPath));
  }
  return paths;
}

async function fetchAllWithdraws(url, opts, appendRaw){
  const all = [];
  let currentUrl = url;
  let safety = 0;
  while(currentUrl && safety < 200){
    safety++;
    const r = await fetch(currentUrl, opts);
    const txt = await r.text();
    if(appendRaw){ appendRaw('\n\nWITHDRAW RESPONSE PAGE ' + safety + ':\n' + txt); }
    if(!r.ok) throw new Error('HTTP '+r.status+' pada withdraw endpoint');
    let j; try{ j = JSON.parse(txt); }catch(e){ throw new Error('Withdraw response tidak valid JSON'); }
    // find list
    let list = get(j, opts.listPath) || j;
    if(Array.isArray(list)) all.push(...list);
    else {
      const arrayPaths = findArrayPaths(j);
      if(arrayPaths.length === 1){ const p = arrayPaths[0]; const found = get(j,p); if(Array.isArray(found)) all.push(...found); }
      else if(arrayPaths.length > 1 && safety===1){ throw new Error('Banyak kandidat array withdraw: ' + arrayPaths.join(', ')); }
    }
    // pagination
    const meta = j && j.meta ? j.meta : null;
    if(meta && (meta.hasMore === true || meta.has_more === true)){
      const nextCursor = meta.cursor || meta.nextCursor || meta.next_cursor || null;
      if(nextCursor){ try{ const u = new URL(currentUrl); if(u.searchParams.has('cursor')) u.searchParams.set('cursor', nextCursor); else u.searchParams.append('cursor', nextCursor); currentUrl = u.toString(); continue;}catch(e){ break; } }
      else break;
    }
    const links = j && j.links ? j.links : null;
    if(links && links.next){ currentUrl = links.next; continue; }
    break;
  }
  return all;
}

function renderWithdrawTable(details){
  const wrap = document.getElementById('withdrawTableWrapper');
  if(!wrap) return;
  if(!details || details.length===0){ 
    wrap.innerHTML = '<div class="small" style="padding:16px;text-align:center;color:#999">📭 Tidak ada data withdraw pada range ini.</div>'; 
    return; 
  }
  let html = '<table><thead><tr><th>No</th><th>Request Date</th><th>Status</th><th>User</th><th>Reference No.</th><th>Bank</th><th>Account Name</th><th>Account Holder Name</th><th style="text-align:right">Amount</th><th style="text-align:right">Disbursement Fee</th></tr></thead><tbody>';
  for(let i=0;i<details.length;i++){
    const d = details[i];
    html += `<tr><td>${i+1}</td><td>${d.requestDate}</td><td>${d.status}</td><td>${d.user}</td><td>${d.referenceNo}</td><td>${d.bank}</td><td>${d.accountName}</td><td>${d.accountHolderName}</td><td style="text-align:right">${formatNumber(d.amount)}</td><td style="text-align:right">${formatNumber(d.fee)}</td></tr>`;
  }
  html += '</tbody></table>';
  wrap.innerHTML = html;
}

function showSection(sectionId){
  // hide all sections
  document.querySelectorAll('section').forEach(s=>s.classList.remove('active'));
  // show target section
  const target = document.getElementById(sectionId);
  if(target) target.classList.add('active');
  // update nav buttons
  document.querySelectorAll('.nav button').forEach(b=>b.classList.remove('active'));
  document.getElementById('nav-'+sectionId)?.classList.add('active');
}

async function fetchBalances(){
  const endpoint = document.getElementById('endpoint').value.trim();
  const auth = document.getElementById('auth').value.trim();
  const pathA = document.getElementById('pathActive').value.trim();
  const pathP = document.getElementById('pathPending').value.trim();
  const withdrawEndpoint = document.getElementById('withdrawEndpoint').value.trim();
  const withdrawListPath = document.getElementById('withdrawListPath').value.trim() || 'data';
  const withdrawAmountPath = document.getElementById('withdrawAmountPath').value.trim() || 'amount';

  const rawEl = document.getElementById('raw');
  const rawCard = document.getElementById('rawCard');
  rawEl.textContent = '';
  rawCard.style.display = rawVisible ? 'block' : 'none';

  const activeEl = document.getElementById('active');
  const pendingEl = document.getElementById('pending');
  const totalBalanceEl = document.getElementById('totalBalance');
  const totalWithdrawEl = document.getElementById('totalWithdraw');
  const withdrawSummary = document.getElementById('withdrawSummary');
  const reconcileStatus = document.getElementById('reconcileStatus');

  // prepare fetch options
  const finalEndpoint = endpoint || 'https://api-service.minerapay.com/v1/merchant/balance';
  const headers = {'Accept':'application/json'}; if(auth) headers['Authorization']=auth;
  const fetchOpts = { headers };
  try{ const origin = new URL(finalEndpoint).origin; if(origin === location.origin) fetchOpts.credentials='include'; }catch(e){}

  try{
    activeEl.textContent = '...'; pendingEl.textContent = '...'; totalWithdrawEl.textContent = '...';
    const res = await fetch(finalEndpoint, fetchOpts);
    const txt = await res.text(); rawEl.textContent = txt; rawCard.style.display = rawVisible ? 'block' : 'none';
    if(!res.ok) throw new Error('HTTP '+res.status+' saat panggil balance endpoint');
    let j; try{ j = JSON.parse(txt); }catch(e){ throw new Error('Balance response invalid JSON'); }
    const active = Number(get(j, pathA) || j.active || (j.data && (j.data.active || j.data.active_balance)) || 0);
    const pending = Number(get(j, pathP) || j.pending || (j.data && (j.data.pending || j.data.pending_balance)) || 0);
    activeEl.textContent = formatNumber(active); 
    pendingEl.textContent = formatNumber(pending);
    totalBalanceEl.textContent = formatNumber(active+pending);

    // fetch withdraws if provided
    let details = [];
    let sumAmount=0,sumFee=0,count=0,sumAmountGT=0,sumFeeGT=0,countGT=0,sumAmountLT=0,sumFeeLT=0,countLT=0;
    if(withdrawEndpoint){
      const startDateValue = document.getElementById('startDate').value;
      const endDateValue = document.getElementById('endDate').value;
      let urlString = withdrawEndpoint;
      try{
        const url = new URL(withdrawEndpoint);
        if(startDateValue) url.searchParams.set('start_date', new Date(startDateValue).toISOString());
        if(endDateValue) url.searchParams.set('end_date', new Date(endDateValue).toISOString());
        urlString = url.toString();
      }catch(e){
        // fallback to raw string if URL not valid
      }
      const optsForWithdraw = { headers: fetchOpts.headers, listPath: withdrawListPath };
      if(fetchOpts.credentials) optsForWithdraw.credentials = fetchOpts.credentials;
      const appendRaw = (s)=>{ rawEl.textContent += s; if(rawVisible) rawCard.style.display = 'block'; };
        const all = await fetchAllWithdraws(urlString, optsForWithdraw, appendRaw);
      count = all.length;
      for(const it of all){
        const amt = Number(get(it, withdrawAmountPath) || it.amount || it.value || it.nominal || 0);
        const a = isNaN(amt)?0:amt; sumAmount += a;
        const fee = Number(getField(it, ['disbursementFee','disbursement_fee','fee','withdraw_fee','admin_fee','commission','charge'])) || ((a>10000000)?3500:1600);
        sumFee += fee;
        if(a>10000000){ sumAmountGT+=a; sumFeeGT+=fee; countGT++; } else { sumAmountLT+=a; sumFeeLT+=fee; countLT++; }
            const rawStatus = getField(it, ['status','transactionStatus','transaction_status']);
        const recordId = getField(it, ['id','referenceNo','reference_no','ref','trxRef','transactionRef','reference']);
        details.push({
          id: recordId,
          requestDate: formatDate(getField(it, ['requestDate','request_date','createdAt','created_at','created'])),
          status: rawStatus,
          user: getField(it, ['user','username','email','merchant','customerName','user_name']),
          referenceNo: getField(it, ['referenceNo','reference_no','ref','trxRef','transactionRef','reference']),
          bank: getField(it, ['bank','bankName','bank_name']),
          accountName: getField(it, ['accountName','account_name','bank_account','account_number']),
          accountHolderName: getField(it, ['accountHolderName','account_holder_name','beneficiaryName','beneficiary_name','owner_name']),
          amount: a,
          fee: fee,
          normalizedStatus: normalizeStatus(rawStatus)
        });
      }
    }

    const newIds = details.filter(d => d.id && !lastWithdrawIds.has(d.id));
    if(lastWithdrawIds.size > 0 && newIds.length > 0){
      showToast(`Ada ${newIds.length} transaksi withdraw baru`, 'info');
    }
    lastWithdrawIds = new Set(details.filter(d => d.id).map(d => d.id));

    const manualBalance = Number(document.getElementById('manualBalance')?.value || 0);
    currentWithdrawDataAll = details;
    totalWithdrawEl.textContent = formatNumber(sumAmount);
    document.getElementById('totalFee').textContent = formatNumber(sumFee);
    document.getElementById('manualBalanceDisplay').textContent = manualBalance ? formatNumber(manualBalance) : '-';
    withdrawSummary.textContent = `Total Form Withdraw : ${count}
Total Amount : ${formatNumber(sumAmount)}
Total Fee : ${formatNumber(sumFee)}

▸ Amount > 10,000,000 : ${countGT} form | Total: ${formatNumber(sumAmountGT)} | Fee: ${formatNumber(sumFeeGT)}
▸ Amount ≤ 10,000,000 : ${countLT} form | Total: ${formatNumber(sumAmountLT)} | Fee: ${formatNumber(sumFeeLT)}`;

    applyStatusFilter();

    const expectedBalance = manualBalance - sumAmount - sumFee;
    const diff = expectedBalance - active;
    const lastCheckEl = document.getElementById('lastCheck');
    const statusDetails = document.getElementById('statusDetails');
    const now = new Date();
    if(lastCheckEl) lastCheckEl.textContent = now.toLocaleString('id-ID', { year:'numeric', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' });
    if(statusDetails) statusDetails.textContent = `Manual Balance - Withdraw - Fee = ${formatNumber(expectedBalance)} | Active Balance = ${formatNumber(active)}`;
    const isKlop = diff === 0;
    const statusText = isKlop ? '✓ KLOP' : `✗ TIDAK KLOP (selisih: ${formatNumber(Math.abs(diff))})`;
    reconcileStatus.textContent = statusText;
    const reconciledBadge = document.getElementById('reconciledBadge');
    if (reconciledBadge) {
      reconciledBadge.innerHTML = `<span class="status-badge ${isKlop ? 'status-klop' : 'status-error'}">${isKlop ? 'KLOP' : 'SELISIH'}</span>`;
    }

    // Log to backend history
    if (authToken) {
      recordCheckHistory(document.getElementById('endpoint').value, statusText, diff);
    }

  }catch(err){
    console.error(err); 
    rawEl.textContent += '\n\n❌ ERROR: '+err.message; 
    rawCard.style.display = rawVisible ? 'block' : 'none';
    activeEl.textContent='-'; 
    pendingEl.textContent='-'; 
    totalBalanceEl.textContent='-'; 
    totalWithdrawEl.textContent='-';
    document.getElementById('withdrawSummary').textContent = '❌ Error: '+err.message;
    renderWithdrawTable([]);
    reconcileStatus.textContent='ERROR';
    showPopup('❌ Error: '+err.message);
  }
}

function exportCSV(){
  if(!currentWithdrawData || currentWithdrawData.length===0){
    alert('Tidak ada data untuk diekspor. Silakan simpan pengaturan dan ambil data terlebih dahulu.');
    return;
  }
  const headers = ['No', 'Request Date', 'Status', 'User', 'Reference No.', 'Bank', 'Account Name', 'Account Holder Name', 'Amount', 'Disbursement Fee'];
  const rows = currentWithdrawData.map((d,i)=>[i+1, d.requestDate, d.status, d.user, d.referenceNo, d.bank, d.accountName, d.accountHolderName, d.amount, d.fee]);
  const csv = [headers, ...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `withdraw_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  alert('✓ File CSV berhasil diunduh');
}

// UI wiring
function saveSettings() {
  const settings = {
    endpoint: document.getElementById('endpoint').value.trim(),
    auth: document.getElementById('auth').value.trim(),
    pathActive: document.getElementById('pathActive').value.trim(),
    pathPending: document.getElementById('pathPending').value.trim(),
    withdrawEndpoint: document.getElementById('withdrawEndpoint').value.trim(),
    withdrawListPath: document.getElementById('withdrawListPath').value.trim(),
    withdrawAmountPath: document.getElementById('withdrawAmountPath').value.trim(),
    startDate: document.getElementById('startDate').value,
    endDate: document.getElementById('endDate').value,
    refreshInterval: document.getElementById('refreshInterval').value,
    manualBalance: document.getElementById('manualBalance').value
  };
  localStorage.setItem('minerapaySettings', JSON.stringify(settings));
  showPopup('✓ Settings disimpan');
  scheduleAutoRefresh(settings.refreshInterval || 600);
  showSection('overview');
  fetchBalances();
}

function recordCheckHistory(endpoint, status, difference) {
  const entry = {
    id: Date.now(),
    username: currentUser.username,
    fullName: currentUser.fullName,
    role: currentUser.role,
    timestamp: new Date().toISOString(),
    reconcileStatus: status,
    difference: difference,
    endpoint: endpoint
  };
  
  if (mockMode) {
    mockHistory.push(entry);
    loadHistory();
    return;
  }
  
  fetch(`${API_URL}/balance/check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({ endpoint, reconcileStatus: status, difference })
  })
  .then(r => r.json())
  .then(data => {
    loadHistory();
  })
  .catch(err => console.error('Error recording history:', err));
}

function loadSettings(){
  const saved = localStorage.getItem('minerapaySettings');
  if(!saved) return;
  try{
    const settings = JSON.parse(saved);
    if(settings.endpoint) document.getElementById('endpoint').value = settings.endpoint;
    if(settings.auth) document.getElementById('auth').value = settings.auth;
    if(settings.pathActive) document.getElementById('pathActive').value = settings.pathActive;
    if(settings.pathPending) document.getElementById('pathPending').value = settings.pathPending;
    if(settings.withdrawEndpoint) document.getElementById('withdrawEndpoint').value = settings.withdrawEndpoint;
    if(settings.withdrawListPath) document.getElementById('withdrawListPath').value = settings.withdrawListPath;
    if(settings.withdrawAmountPath) document.getElementById('withdrawAmountPath').value = settings.withdrawAmountPath;
    if(settings.startDate) document.getElementById('startDate').value = settings.startDate;
    if(settings.endDate) document.getElementById('endDate').value = settings.endDate;
    if(settings.refreshInterval) document.getElementById('refreshInterval').value = settings.refreshInterval;
    if(settings.manualBalance) document.getElementById('manualBalance').value = settings.manualBalance;
  }catch(e){ console.warn('Error loading settings', e); }
}

window.addEventListener('DOMContentLoaded', () => {
  // Check backend status
  checkBackendStatus();
  
  const saved = localStorage.getItem('authToken');
  const user = localStorage.getItem('currentUser');
  if (saved && user) {
    authToken = saved;
    currentUser = JSON.parse(user);
    showMainApp();
  }

  document.getElementById('exportBtn')?.addEventListener('click', exportCSV);
  document.getElementById('saveSettings').addEventListener('click', saveSettings);
  document.getElementById('toggleRawBtn')?.addEventListener('click', () => {
    rawVisible = !rawVisible;
    document.getElementById('rawCard').style.display = rawVisible ? 'block' : 'none';
  });
  document.getElementById('popupClose')?.addEventListener('click', hidePopup);
  document.getElementById('popupModal')?.addEventListener('click', e => { if(e.target.id === 'popupModal') hidePopup(); });
  document.getElementById('statusFilter')?.addEventListener('change', applyStatusFilter);
  const intervalField = document.getElementById('refreshInterval');
  intervalField?.addEventListener('change', ()=>{
    const value = Number(intervalField.value);
    if(value > 0) scheduleAutoRefresh(value);
  });
  document.getElementById('copyAutodetect').addEventListener('click', ()=>{
    const script = `(async function(){const paths=['/api/dashboard','/api/summary','/api/wallets/summary','/v1/merchant/balance']; for(const p of paths){try{const u=(location.origin+p).replace(/([^:])\/\//,'$1/'); const r=await fetch(u,{credentials:'include',headers:{'Accept':'application/json'}}); if(!r.ok) continue; const j=await r.json(); if(JSON.stringify(j).toLowerCase().includes('active')){console.log('found',u,j); return;} }catch(e){} } console.log('not found');})();`;
    copyToClipboard(script);
  });

  setupAutoCheckToggle();
});

function checkBackendStatus() {
  const statusEl = document.getElementById('backendStatus');
  if (!statusEl) return;
  
  fetch(`${API_URL}/auth/me`, {
    headers: { 'Authorization': 'Bearer test' },
    signal: AbortSignal.timeout(3000)
  })
  .then(() => {
    statusEl.innerHTML = '✅ Backend tersedia - Gunakan dengan database persisten';
    statusEl.style.background = '#dcfce7';
    statusEl.style.color = '#166534';
    statusEl.style.borderColor = '#86efac';
  })
  .catch(() => {
    statusEl.innerHTML = '⚠️ Backend tidak tersedia - Dashboard akan berjalan di mode offline (data disimpan di browser saja)';
    statusEl.style.background = '#fef3c7';
    statusEl.style.color = '#92400e';
    statusEl.style.borderColor = '#fcd34d';
  });
}

window.fetchBalances = fetchBalances;
window.copyToClipboard = copyToClipboard;
window.showSection = showSection;
window.showPopup = showPopup;
window.hidePopup = hidePopup;
