/* app.js - Vanilla JS single-file app (hash routing) */
/* Behavior:
   - loads /data.json initially, caches into localStorage
   - pages: #/  -> map + sidebar
            #/admin -> admin table + add button
            #/admin/new -> add form
            #/admin/edit/:id -> edit form
*/

const STORAGE_KEY = 'ews.taiz.incidents';
const DATA_JSON = 'data.json';

// utilities
const el = (s) => document.querySelector(s);
const fmt = n => new Intl.NumberFormat('ar-EG').format(n);
const riskColor = (r) => ({ 'منخفضة':'#22c55e','متوسطة':'#eab308','عالية':'#f97316','عالية جداً':'#ef4444' })[r] || '#94a3b8';
const threatEmoji = { 'فيضانات':'💧','جفاف':'🌵','عواصف':'🌬️','انهيارات أرضية':'⛰️','أوبئة':'🦠','حرائق':'🔥','نزاع':'⚠️' };

async function loadInitial(){
  const cached = localStorage.getItem(STORAGE_KEY);
  if (cached) return JSON.parse(cached);
  const res = await fetch(DATA_JSON);
  const json = await res.json();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(json.incidents));
  return json.incidents;
}
function saveData(list){ localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }
function allIncidents(){ return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
function getIncident(id){ return allIncidents().find(i=>i.id===Number(id)); }
function deleteIncident(id){
  const list = allIncidents().filter(i=>i.id!==Number(id)); saveData(list); return list;
}
function upsertIncident(obj){
  const list = allIncidents(); const idx = list.findIndex(i=>i.id===obj.id);
  if(idx>=0) list[idx]=obj; else list.unshift(obj); saveData(list); return list;
}

function route(){
  const hash = location.hash.replace('#','') || '/';
  document.querySelectorAll('.navlink').forEach(a=> a.classList.toggle('active', a.getAttribute('href') === '#'+hash));
  if (hash === '/' || hash === '') renderMapPage();
  else if (hash === '/admin') renderAdminPage();
  else if (hash === '/admin/new') renderFormPage();
  else if (hash.startsWith('/admin/edit/')) {
    const id = hash.split('/').pop(); renderFormPage(id);
  } else renderMapPage();
}

/* ---------- MAP PAGE ---------- */
async function renderMapPage(){
  const root = document.getElementById('app'); root.innerHTML = '';
  const wrapper = document.createElement('div'); wrapper.className='app-grid container';
  // left: map
  const mapCard = document.createElement('div'); mapCard.className='card map-card';
  mapCard.innerHTML = `<div id="map"></div>`;
  // right: sidebar
  const side = document.createElement('aside'); side.className='card sidebar';
  side.innerHTML = `
    <div>
      <input id="q" placeholder="بحث عام (المديرية/القرية/التهديد)..." class="input" />
      <div class="filter-row" style="margin-top:8px">
        <select id="filter-district" class="input"><option>الكل</option></select>
        <select id="filter-threat" class="input"><option>الكل</option><option>فيضانات</option><option>جفاف</option><option>عواصف</option><option>انهيارات أرضية</option><option>أوبئة</option><option>حرائق</option><option>نزاع</option></select>
      </div>
      <div class="stat-grid" style="margin-top:10px">
        <div class="stat"><div class="kv">عدد الحوادث</div><strong id="stat-count">0</strong></div>
        <div class="stat"><div class="kv">المتأثرون</div><strong id="stat-affected">0</strong></div>
      </div>
    </div>
    <div><h4 class="kv">أحدث الحوادث</h4><div id="recent-list" style="display:grid;gap:8px;margin-top:8px"></div></div>
  `;
  wrapper.appendChild(mapCard); wrapper.appendChild(side); root.appendChild(wrapper);

  // load data
  const list = allIncidents();
  const districts = Array.from(new Set(list.map(i=>i.district_ar))).sort();
  const sel = side.querySelector('#filter-district');
  districts.forEach(d=>{ const o=document.createElement('option'); o.textContent=d; sel.appendChild(o) });

  // build map
  const map = L.map('map').setView([13.58,44.02], 10);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ attribution:'© OpenStreetMap' }).addTo(map);

  let markers = [];
  function drawMarkers(data){
    markers.forEach(m=>map.removeLayer(m)); markers=[];
    data.forEach(i=>{
      const color = riskColor(i.risk_level_ar);
      const emoji = threatEmoji[i.threat_type_ar] || '📍';
      const html = `<div style="width:36px;height:36px;border-radius:18px;display:flex;align-items:center;justify-content:center;border:2px solid ${color};background:${color}22;font-size:18px">${emoji}</div>`;
      const icon = L.divIcon({ html, className:'', iconSize:[36,36], iconAnchor:[18,18] });
      const m = L.marker([i.location.lat, i.location.lng], { icon }).addTo(map);
      m.bindPopup(`
        <div style="text-align:right;direction:rtl">
          <b>${i.threat_type_ar} — <span style="color:${color}">${i.risk_level_ar}</span></b>
          <div class="kv">التاريخ: ${i.date}</div>
          <div class="kv">المديرية: ${i.district_ar}</div>
          <div class="kv">القرية: ${i.village_ar}</div>
          <div class="kv">المتأثرون: ${i.affected_persons}</div>
          <div style="margin-top:6px">${i.description_ar}</div>
          <div style="margin-top:6px"><a href="#/admin/edit/${i.id}" class="kv">تعديل الحادث</a></div>
        </div>
      `);
      markers.push(m);
    });
  }

  function refresh(){
    const q = side.querySelector('#q').value.trim();
    const d = side.querySelector('#filter-district').value;
    const t = side.querySelector('#filter-threat').value;
    const filtered = list.filter(i=>{
      if (q && !(i.district_ar+i.village_ar+i.threat_type_ar+i.description_ar).includes(q)) return false;
      if (d !== 'الكل' && i.district_ar !== d) return false;
      if (t !== 'الكل' && i.threat_type_ar !== t) return false;
      return true;
    });
    drawMarkers(filtered);
    side.querySelector('#stat-count').textContent = fmt(filtered.length);
    side.querySelector('#stat-affected').textContent = fmt(filtered.reduce((s,x)=>s+x.affected_persons,0));
    const rlist = side.querySelector('#recent-list'); rlist.innerHTML='';
    filtered.slice(0,6).forEach(i=>{
      const node = document.createElement('div'); node.className='card';
      node.style.padding='8px'; node.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
        <div style="text-align:right">
          <div style="font-weight:700">${i.threat_type_ar} — <span style="color:${riskColor(i.risk_level_ar)}">${i.risk_level_ar}</span></div>
          <div class="kv">${i.district_ar} • ${i.village_ar}</div>
        </div>
        <div style="font-size:20px">${threatEmoji[i.threat_type_ar]||'📍'}</div>
      </div>`;
      rlist.appendChild(node);
    });
  }

  drawMarkers(list);
  refresh();

  // event listeners
  side.querySelector('#q').addEventListener('input', ()=>refresh());
  side.querySelector('#filter-district').addEventListener('change', ()=>refresh());
  side.querySelector('#filter-threat').addEventListener('change', ()=>refresh());
}

/* ---------- ADMIN PAGE ---------- */
function renderAdminPage(){
  const root = document.getElementById('app'); root.innerHTML = '';
  const wrap = document.createElement('div'); wrap.className='container';
  wrap.innerHTML = `
    <div style="display:flex;gap:10px;align-items:center;margin:16px 0">
      <input id="admin-q" placeholder="بحث..." class="input" style="flex:1" />
      <a href="#/admin/new" class="btn">إضافة حادث جديد</a>
      <button id="reset-data" class="btn ghost">إعادة بيانات افتراضية</button>
    </div>
    <div class="card table-wrap"><table id="inc-table"><thead><tr>
      <th>التاريخ</th><th>المديرية</th><th>التهديد</th><th>الخطورة</th><th>المتأثرون</th><th>إجراءات</th>
    </tr></thead><tbody></tbody></table></div>
  `;
  root.appendChild(wrap);

  function drawTable(q=''){
    const tbody = document.querySelector('#inc-table tbody'); tbody.innerHTML='';
    const list = allIncidents().filter(i=> (i.district_ar + i.village_ar + i.threat_type_ar).includes(q));
    list.forEach(i=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${i.date}</td><td>${i.district_ar}</td><td>${i.threat_type_ar}</td><td>${i.risk_level_ar}</td><td>${fmt(i.affected_persons)}</td>
        <td class="actions">
          <a href="#/admin/edit/${i.id}">تعديل</a>
          <button data-id="${i.id}" class="del">حذف</button>
        </td>`;
      tbody.appendChild(tr);
    });

    document.querySelectorAll('.del').forEach(b=>{
      b.addEventListener('click', (ev)=>{
        const id = ev.currentTarget.getAttribute('data-id');
        if(confirm('حذف هذا الحادث؟')){ deleteIncident(Number(id)); drawTable(document.getElementById('admin-q').value); }
      });
    });
  }

  drawTable();
  document.getElementById('admin-q').addEventListener('input',(e)=> drawTable(e.target.value));
  document.getElementById('reset-data').addEventListener('click', async ()=>{
    if(!confirm('ستستبدل البيانات الحالية بالنسخة الافتراضية من data.json. استمر؟')) return;
    const res = await fetch(DATA_JSON); const json = await res.json();
    saveData(json.incidents); drawTable(); alert('تم الاسترجاع.');
  });
}

/* ---------- FORM PAGE (add/edit) ---------- */
function renderFormPage(editId){
  const root = document.getElementById('app'); root.innerHTML = '';
  const list = allIncidents();
  const isEdit = !!editId;
  const item = isEdit ? getIncident(Number(editId)) : {
    id: Date.now(),
    date: new Date().toISOString().slice(0,10),
    district_ar:'', sub_district_ar:'', village_ar:'', threat_type_ar:'فيضانات',
    affected_persons:0, risk_level_ar:'متوسطة', description_ar:'', location:{lat:13.58,lng:44.02}
  };

  const wrap = document.createElement('div'); wrap.className='container';
  wrap.innerHTML = `
    <div style="display:flex;gap:10px;align-items:center;margin:12px 0">
      <a href="#/admin" class="btn ghost">◀ رجوع</a>
      <h2>${isEdit? 'تعديل حادث':'إضافة حادث جديد'}</h2>
    </div>
    <div class="card" style="padding:12px">
      <form id="incident-form">
        <div class="form-grid">
          <label>التاريخ<input type="date" name="date" class="input" required></label>
          <label>المديرية<input name="district_ar" class="input" required></label>
          <label>العزلة<input name="sub_district_ar" class="input" required></label>
          <label>القرية<input name="village_ar" class="input" required></label>
          <label>نوع التهديد
            <select name="threat_type_ar" class="input">
              <option>فيضانات</option><option>جفاف</option><option>عواصف</option><option>انهيارات أرضية</option><option>أوبئة</option><option>حرائق</option><option>نزاع</option>
            </select>
          </label>
          <label>مستوى الخطورة
            <select name="risk_level_ar" class="input"><option>منخفضة</option><option>متوسطة</option><option>عالية</option><option>عالية جداً</option></select>
          </label>
          <label>عدد المتأثرين<input type="number" name="affected_persons" class="input" min="0" required></label>
          <label style="grid-column:1/-1">الوصف<textarea name="description_ar" rows="4" class="input" required></textarea></label>
          <div style="grid-column:1/-1"><small class="kv">انقر على الخريطة لتعيين الموقع (ضمن حدود تعز تقريباً)</small></div>
          <label>Latitude<input name="lat" class="input" readonly></label>
          <label>Longitude<input name="lng" class="input" readonly></label>
        </div>
        <div style="margin-top:10px">
          <button type="submit" class="btn">حفظ</button>
          <a href="#/admin" class="btn ghost">إلغاء</a>
        </div>
      </form>
    </div>

    <div class="card map-card" style="margin-top:12px"><div id="mini-map" style="height:320px"></div></div>
  `;
  root.appendChild(wrap);

  // fill form with item
  const form = document.getElementById('incident-form');
  ['date','district_ar','sub_district_ar','village_ar','threat_type_ar','risk_level_ar','affected_persons','description_ar'].forEach(k=>{
    form.elements[k].value = item[k] !== undefined ? item[k] : '';
  });
  form.elements['lat'].value = item.location.lat; form.elements['lng'].value = item.location.lng;

  // init mini map
  const map = L.map('mini-map').setView([item.location.lat, item.location.lng], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ attribution:'' }).addTo(map);
  let marker = L.marker([item.location.lat,item.location.lng],{ draggable:false }).addTo(map);

  map.on('click', e=>{
    const {lat,lng} = e.latlng;
    if(lat < 13.2 || lat > 13.9 || lng < 43.8 || lng > 44.4){
      alert('الموقع خارج حدود تعز التقريبية، يرجى اختيار نقطة داخل المحافظة.');
      return;
    }
    form.elements['lat'].value = lat.toFixed(6);
    form.elements['lng'].value = lng.toFixed(6);
    marker.setLatLng([lat,lng]);
  });

  form.addEventListener('submit',(ev)=>{
    ev.preventDefault();
    // basic validation
    const data = {
      id: isEdit ? item.id : Date.now(),
      date: form.elements['date'].value,
      district_ar: form.elements['district_ar'].value.trim(),
      sub_district_ar: form.elements['sub_district_ar'].value.trim(),
      village_ar: form.elements['village_ar'].value.trim(),
      threat_type_ar: form.elements['threat_type_ar'].value,
      affected_persons: Number(form.elements['affected_persons'].value)||0,
      risk_level_ar: form.elements['risk_level_ar'].value,
      description_ar: form.elements['description_ar'].value.trim(),
      location: {
        lat: Number(form.elements['lat'].value) || 13.58,
        lng: Number(form.elements['lng'].value) || 44.02
      }
    };
    // ensure location within bounds
    if (data.location.lat < 13.2 || data.location.lat > 13.9 || data.location.lng < 43.8 || data.location.lng > 44.4){
      alert('الإحداثيات خارج حدود تعز التقريبية.');
      return;
    }
    upsertIncident(data);
    location.hash = '#/admin';
  });
}

/* ---------- startup ---------- */
window.addEventListener('load', async ()=>{
  await loadInitial();
  route();
  window.addEventListener('hashchange', route);
});
