const STORE='ayelet-miller-v1';
const SUPABASE_URL='https://tvoriihijpwrxdnayfdq.supabase.co';
const SUPABASE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2b3JpaWhpanB3cnhkbmF5ZmRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMTMwMjcsImV4cCI6MjEwNjc4OTAyN30.f-Bp99AbxVT-WYHtbaR48NvqU9mDfyOVJFRf34Ks91s';
const seed={bookings:[],prices:[{id:'p1',name:'איפור כלה',price:1800},{id:'p2',name:'איפור ערב',price:450},{id:'p3',name:'ליווי לאירוע',price:900}],history:[]};
let data=load();
let cloud=null,cloudSession=null,syncTimer=null;
const $=s=>document.querySelector(s), money=n=>new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS',maximumFractionDigits:0}).format(Number(n)||0);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function load(){try{return {...structuredClone(seed),...JSON.parse(localStorage.getItem(STORE)||'{}')}}catch{return structuredClone(seed)}}
function save(action='עדכון נתונים'){data.history.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),action});data.history=data.history.slice(0,250);localStorage.setItem(STORE,JSON.stringify(data));render();syncCloud()}
function syncCloud(){if(!cloudSession||!cloud)return;clearTimeout(syncTimer);syncTimer=setTimeout(async()=>{const {error}=await cloud.from('app_state').upsert({workspace_id:'main',user_id:cloudSession.user.id,payload:data,updated_at:new Date().toISOString()},{onConflict:'workspace_id'});toast(error?'השמירה בענן נכשלה — נשמר גיבוי במכשיר':'נשמר בענן')},350)}
async function loadCloud(){const {data:row,error}=await cloud.from('app_state').select('payload').eq('workspace_id','main').maybeSingle();if(error){toast('הגישה למאגר לא אושרה');return}if(row?.payload){data={...structuredClone(seed),...row.payload};localStorage.setItem(STORE,JSON.stringify(data));render();toast('הנתונים סונכרנו')}else syncCloud()}
async function initCloud(){if(['127.0.0.1','localhost'].includes(location.hostname))return;if(!window.supabase){toast('אין חיבור לשירות הנתונים');return}cloud=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);const {data:{session}}=await cloud.auth.getSession();cloudSession=session;cloud.auth.onAuthStateChange(async(_event,next)=>{cloudSession=next;if(next){$('#loginDialog').close();await loadCloud()}});if(session)await loadCloud();else $('#loginDialog').showModal()}
function calc(b){const total=Number(b.servicePrice||0)+Number(b.travelPrice||0),paid=b.depositStatus==='שולמה'?Number(b.depositAmount||0):0;return {total,paid,balance:Math.max(0,total-paid)}}
function toast(t){const el=$('#toast');el.textContent=t;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200)}
function render(){const now=new Date(),upcoming=data.bookings.filter(b=>b.status!=='בוטלה'&&new Date(`${b.eventDate}T${b.eventTime||'00:00'}`)>=new Date(now.toDateString())).sort((a,b)=>a.eventDate.localeCompare(b.eventDate));const open=data.bookings.filter(b=>!['הושלמה','בוטלה'].includes(b.status));const due=open.reduce((n,b)=>n+calc(b).balance,0);$('#stats').innerHTML=`<div class="stat"><span>אירועים קרובים</span><strong>${upcoming.length}</strong></div><div class="stat"><span>הזמנות פעילות</span><strong>${open.length}</strong></div><div class="stat"><span>לקוחות</span><strong>${new Set(data.bookings.map(b=>b.phone)).size}</strong></div><div class="stat"><span>יתרות פתוחות</span><strong>${money(due)}</strong></div>`;renderList()}
function renderList(){const q=$('#searchInput').value.trim().toLowerCase(),sf=$('#statusFilter').value;const items=data.bookings.filter(b=>(!q||b.clientName.toLowerCase().includes(q)||b.phone.replace(/\D/g,'').includes(q.replace(/\D/g,'')))&&(!sf||b.status===sf)).sort((a,b)=>`${a.eventDate}${a.eventTime}`.localeCompare(`${b.eventDate}${b.eventTime}`));$('#emptyState').hidden=items.length>0;$('#bookingList').innerHTML=items.map(b=>{const d=new Date(`${b.eventDate}T12:00:00`),c=calc(b);return `<article class="booking" data-id="${b.id}" tabindex="0"><div class="datebox"><strong>${d.getDate()}</strong><span>${d.toLocaleDateString('he-IL',{month:'short'})}</span></div><div class="meta"><strong>${esc(b.clientName)}</strong><small>${esc(b.phone)} · ${esc(b.location||'ללא מיקום')}</small></div><div class="service">${esc(b.service)}</div><div class="money">${money(c.balance)}<small> יתרה</small></div><span class="badge ${b.status==='הושלמה'?'done':''}">${esc(b.status)}</span></article>`}).join('')}
function services(){const s=$('#serviceSelect');s.innerHTML=data.prices.map(p=>`<option value="${esc(p.name)}" data-price="${p.price}">${esc(p.name)}</option>`).join('')+`<option value="אחר">אחר</option>`}
function toggleOtherService(){const f=$('#bookingForm'),isOther=f.elements.serviceSelection.value==='אחר',field=$('#otherServiceField'),input=$('#serviceOtherInput');field.hidden=!isOther;input.required=isOther;if(!isOther)input.value=''}
function openBooking(b){services();const f=$('#bookingForm');f.reset();f.elements.id.value=b?.id||'';f.elements.makeupCount.value=b?.makeupCount||1;$('#dialogTitle').textContent=b?'עריכת הזמנה':'הזמנה חדשה';if(b){Object.entries(b).forEach(([k,v])=>{if(f.elements[k]&&!['serviceSelection','serviceOther'].includes(k))f.elements[k].value=v});const known=data.prices.some(p=>p.name===b.service)&&b.serviceIsOther!=='true';f.elements.serviceSelection.value=known?b.service:'אחר';f.elements.serviceOther.value=known?'':b.service}else{f.elements.eventDate.value=new Date().toISOString().slice(0,10);const p=data.prices[0];if(p){f.elements.serviceSelection.value=p.name;f.elements.servicePrice.value=p.price}}toggleOtherService();updateTotals();$('#bookingDialog').showModal()}
function updateTotals(){const f=$('#bookingForm'),c=calc({servicePrice:f.elements.servicePrice.value,travelPrice:f.elements.travelPrice.value,depositAmount:f.elements.depositAmount.value,depositStatus:f.elements.depositStatus.value});$('#liveTotals').innerHTML=`<span>סה״כ<strong>${money(c.total)}</strong></span><span>שולם<strong>${money(c.paid)}</strong></span><span>יתרה לתשלום<strong>${money(c.balance)}</strong></span>`}
function submitBooking(){const f=$('#bookingForm'),obj=Object.fromEntries(new FormData(f)),isOther=obj.serviceSelection==='אחר';obj.service=isOther?obj.serviceOther.trim():obj.serviceSelection;obj.serviceIsOther=String(isOther);delete obj.serviceSelection;delete obj.serviceOther;if(!obj.service){toast('יש לציין את סוג השירות');return}if(!Number.isInteger(Number(obj.makeupCount))||Number(obj.makeupCount)<1){toast('יש להזין כמות מאופרות תקינה');return}obj.id=obj.id||crypto.randomUUID();obj.updatedAt=new Date().toISOString();const i=data.bookings.findIndex(x=>x.id===obj.id);if(i>=0)data.bookings[i]={...data.bookings[i],...obj};else{obj.createdAt=obj.updatedAt;data.bookings.push(obj)}save(`${i>=0?'עודכנה':'נוצרה'} הזמנה עבור ${obj.clientName}`);toast('ההזמנה נשמרה')}
const dateHe=value=>value?new Date(`${value}T12:00:00`).toLocaleDateString('he-IL'):'לא נקבע';
const safeFileName=value=>String(value||'לקוחה').trim().replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,'-');
function agreementHtml(b){const c=calc(b),created=dateHe((b.createdAt||'').slice(0,10));return `<section class="agreement" id="agreement-${b.id}" dir="rtl">
  <header class="agreement-header"><img class="agreement-logo" src="ayelet-logo.png" alt="AYELET MILLER"><div><h1>הסכם למתן שירותי איפור</h1><p>מספר הסכם: ${esc(String(b.id).slice(0,8).toUpperCase())} · תאריך הפקה: ${new Date().toLocaleDateString('he-IL')}</p></div></header>
  <div class="agreement-block"><h2>פרטי הלקוחה והאירוע</h2>
    <div class="agreement-fields">
      <div><strong>שם הלקוחה</strong><span>${esc(b.clientName)}</span></div>
      <div><strong>טלפון</strong><span>${esc(b.phone)}</span></div>
      ${b.email?`<div><strong>דוא״ל</strong><span>${esc(b.email)}</span></div>`:""}
      <div><strong>תאריך הזמנה</strong><span>${created}</span></div>
      <div><strong>תאריך האירוע</strong><span>${dateHe(b.eventDate)}</span></div>
      <div><strong>שעת האירוע</strong><span>${esc(b.eventTimeText||b.eventTime||"לא נקבעה")}</span></div>
      <div><strong>מקום ההתארגנות</strong><span>${esc(b.location||"לא נקבע")}</span></div>
    </div>
  </div>
  <div class="agreement-block"><h2>פרטי השירות</h2>
    <div class="agreement-fields">
      <div><strong>סוג השירות</strong><span>${esc(b.service)}</span></div>
      <div><strong>כמות מאופרות</strong><span>${esc(b.makeupCount||1)}</span></div>
      ${b.serviceDetails?`<div class="agreement-field-wide"><strong>פירוט השירות</strong><span>${esc(b.serviceDetails).replace(/\n/g,"<br>")}</span></div>`:""}
    </div>
  </div>
  <div class="agreement-block"><h2>פירוט תשלום</h2>
    <div class="agreement-fields">
      <div><strong>מחיר השירות</strong><span>${money(b.servicePrice)}</span></div>
      <div><strong>נסיעות</strong><span>${money(b.travelPrice)}</span></div>
      ${b.travelLocation?`<div class="agreement-field-wide"><strong>מיקום הנסיעה</strong><span>${esc(b.travelLocation)}</span></div>`:""}
      <div><strong>אמצעי תשלום</strong><span>${esc(b.paymentMethod||"טרם נקבע")}</span></div>
      <div><strong>מקדמה ששולמה</strong><span>${money(c.paid)}</span></div>
      ${b.depositDetails?`<div class="agreement-field-wide"><strong>פירוט מקדמה</strong><span>${esc(b.depositDetails).replace(/\n/g,"<br>")}</span></div>`:""}
    </div>
    <div class="agreement-payment-total"><div><strong>סה״כ לתשלום</strong><span>${money(c.total)}</span></div><div><strong>יתרה לתשלום</strong><span>${money(c.balance)}</span></div></div>
  </div>
  ${b.agreementNotes?`<div class="agreement-note"><h2>פרטים נוספים</h2><p>${esc(b.agreementNotes).replace(/\n/g,'<br>')}</p></div>`:''}
  <div class="agreement-terms"><h2>תנאי ההתקשרות והביטול</h2>
    <p><strong>יש לציין כי במידה ומאופרת מבטלת איפור, המקדמה לא תקוזז ממחיר איפור ערב/ כלה בתאריך הרשום לעיל ו/או בתאריך אחר</strong></p>
    <h3>יש לקרוא ולאשר בהודעה חוזרת</h3>
    <p>הלקוחה רשאית לבטל הסכם זה בתוך 14 ימים מיום ההתקשרות בהסכם זה, הכל בהתאם לחוק הגנת הצרכן (ביטול עסקה), תשע"א,2010- בין אם הוחל במתן השירות ובין אם לא, בכפוף לתשלום דמי ביטול של 5% ממחיר החבילה או 100 ₪, לפי הנמוך מביניהם, (דמי הביטול ייגבו משווי החבילה במלואה ולא משווי המקדמה).</p>
    <h3>עמלת החזר תשלום:</h3>
    <p>בגין הוצאת שיקים שהופקדו לבנק – על הלקוחה לשלם את עלות משיכתם לפי התעריף שנקבע על ידי הבנק מעת לעת.</p>
    <p>בגין ביטול תשלום שבוצע באמצעות כרטיס אשראי – תחויב הלקוחה בעמלת סליקת כרטיס אשראי כפי שחויבה המאפרת על ידי חברת האשראי.</p>
    <h3>ביטול לאחר 14 ימים מיום ההתקשרות</h3>
    <p>הודעת הביטול תיעשה בדרך של הודעה בכתב ו/או בדואר אלקטרוני, כמפורט במבוא להסכם זה ותכלול שם מלא, מספר ת.ז., מספר טלפון, יום ההתקשרות בהסכם ויום האירוע.</p>
    <p>במקרה של "כוח עליון" (קורונה/מלחמה וכו') כאשר מועד יום האירוע יידחה, הצדדים ייקבעו מועד חדש והמקדמה תועבר לתאריך החדש שייקבע.</p>
    <p>במקרה של "כוח עליון" (קורונה/מלחמה וכו') שאינו מאפשר למאפרת לבצע את עבודות האיפור כמתואר לעיל, המאפרת תנסה למצוא לה מחליפ/ה ו/או להחזיר את המקדמה.</p>
    <p>במקרה של ביטול חוזה עקב סיבות אישיות (ביטול אירוע חלילה) המקדמה אינה חוזרת.</p>
    <p>ביטול לאחר 14 ימים מיום ההתקשרות ועד 60 ימים מיום האירוע תחויב הלקוחה בתשלום 50% משווי החבילה.</p>
    <p>ביטול בטווח הקטן מ-60 ימים מיום האירוע תחויב הלקוחה בתשלום של 80% משווי החבילה.</p>
    <h3>סמכות שיפוט</h3>
    <p>מוסכם על הצדדים כי בכל סכסוך הנוגע להסכם זה ו/או לכל הקשור אליו, במישרין ו/או בעקיפין, תהיה סמכות השיפוט הבלעדית נתונה לבית המשפט המוסמך בחיפה בלבד מקרה של הפרת הסכם זה, ויחולו על הצדדים הוראות הדין הישראלי.</p>
    <p>מוסכם בין הצדדים במקרה של הפרת הסכם זה (מי מהצדדים) כולו או חלקו מכל סיבה שהיא, הפיצוי המקסימאלי לא יעלה על שווי התמורה.</p>
    <p>באיחולי מזל טוב ובשעה טובה</p>
  </div>
  <div class="signature-row"><div><span>חתימת נותנת השירות</span><b>________________</b></div><div><span>חתימת הלקוחה</span><b>________________</b></div><div><span>תאריך</span><b>________________</b></div></div>
  <footer class="agreement-footer">AYELET MILLER · הסכם שירות שנוצר במערכת ניהול ההזמנות</footer>
</section>`}
function agreementOptions(b){return {margin:[10,10,10,10],filename:`הסכם-${safeFileName(b.clientName)}-${b.eventDate||new Date().toISOString().slice(0,10)}.pdf`,image:{type:'jpeg',quality:.98},html2canvas:{scale:2,useCORS:true,backgroundColor:'#ffffff',scrollY:0},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},pagebreak:{mode:['css','legacy'],avoid:['tr','.signature-row']}}}

function openAgreementDocument(id){
 const b=data.bookings.find(x=>x.id===id);
 if(!b){toast('ההזמנה לא נמצאה');return}
 const w=window.open('','_blank');
 if(!w){toast('נא לאפשר חלונות קופצים ב-Safari ולנסות שוב');return}
 const header='<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>הסכם איפור</title>'
  +'<link rel="stylesheet" href="'+new URL('styles.css',location.href).href+'">'
  +'<link rel="stylesheet" href="'+new URL('agreement.css',location.href).href+'">'
  +'<style>body{background:#f8f4f5;margin:0;padding:18px;font-family:Arial,sans-serif}'
  +'.agreement-document-controls{max-width:850px;margin:0 auto 14px;padding:14px;background:#fff;border-radius:12px;display:flex;align-items:center;flex-wrap:wrap;gap:12px}'
  +'.agreement-document-controls button{font:inherit;border:0;padding:11px 16px;border-radius:9px;background:#87163C;color:white;cursor:pointer}'
  +'.agreement-document-controls p{margin:0;flex:1;min-width:200px;font-size:14px}.agreement{max-width:850px;margin:auto}'
  +'@media print{@page{size:A4;margin:12mm}body{padding:0;background:#fff}.agreement-document-controls{display:none!important}.agreement{max-width:none;border:0;box-shadow:none;padding:0!important}.agreement-header,.agreement-block,.agreement-payment-total,.signature-row{break-inside:avoid}.agreement h2{break-after:avoid}}'
  +'</style></head><body>'
  +'<div class="agreement-document-controls"><button onclick="window.print()">הדפסה / שמירה כ-PDF</button><p>באייפון: לחצו על הכפתור, פתחו את תצוגת ההדפסה ובחרו שיתוף כדי לשמור PDF או לשלוח ב-WhatsApp.</p></div>';
 try{
   w.document.open();
   w.document.write(header+agreementHtml(b)+'</body></html>');
   w.document.close();
   w.focus();
   toast('ההסכם נפתח בחלון חדש');
 }catch(error){console.error('Agreement document open failed',error);toast('פתיחת ההסכם נכשלה — נסו דרך Safari')}
}
window.downloadAgreement=openAgreementDocument;
window.shareAgreement=openAgreementDocument;
function detail(id){const b=data.bookings.find(x=>x.id===id);if(!b)return;const phone=b.phone.replace(/\D/g,'').replace(/^0/,'972'),hist=data.history.filter(h=>h.action.includes(b.clientName)).slice(0,8);$('#detailsContent').innerHTML=`<div class="dialog-head"><div><p class="eyebrow">${esc(b.status)}</p><h2>${esc(b.clientName)} · ${dateHe(b.eventDate)}</h2></div><button class="close" onclick="detailsDialog.close()">×</button></div><div class="detail-actions"><button class="primary" onclick="downloadAgreement('${b.id}')">הסכם להורדה כ-PDF</button><button class="secondary" onclick="shareAgreement('${b.id}')">שיתוף ההסכם</button><button class="secondary" onclick="downloadAgreement('${b.id}')">הדפסה</button><button class="secondary" onclick="editBooking('${b.id}')">עריכה</button><button class="secondary" onclick="duplicateBooking('${b.id}')">שכפול</button><button class="secondary" onclick="shareAgreement('${b.id}')">הסכם לשיתוף ב-WhatsApp</button></div>${agreementHtml(b)}${b.internalNotes?`<aside class="internal-note"><strong>הערה פנימית - אינה מופיעה בקובץ:</strong><br>${esc(b.internalNotes).replace(/\n/g,'<br>')}</aside>`:''}<h3>היסטוריית שינויים</h3><div class="timeline">${hist.map(h=>`<div><strong>${esc(h.action)}</strong><small> · ${new Date(h.at).toLocaleString('he-IL')}</small></div>`).join('')||'אין שינויים קודמים'}</div>`;$('#detailsDialog').showModal()}
window.editBooking=id=>{$('#detailsDialog').close();openBooking(data.bookings.find(b=>b.id===id))};
window.duplicateBooking=id=>{const source=data.bookings.find(x=>x.id===id),b={...source,id:'',status:'טיוטה',clientName:source.clientName+' — עותק'};$('#detailsDialog').close();openBooking(b)};
function priceList(){$('#priceContent').innerHTML=`<div class="dialog-head"><div><p class="eyebrow">הגדרות</p><h2>מחירון</h2></div><button class="close" onclick="priceDialog.close()">×</button></div><div id="prices">${data.prices.map(p=>`<div class="price-row"><input value="${esc(p.name)}" data-id="${p.id}" data-k="name"><input type="number" value="${p.price}" data-id="${p.id}" data-k="price"><button class="secondary" data-del="${p.id}">מחיקה</button></div>`).join('')}</div><div class="dialog-actions"><button class="secondary" id="addPrice">הוספת שירות</button><button class="primary" id="savePrices">שמירה</button></div>`;$('#priceDialog').showModal();$('#addPrice').onclick=()=>{data.prices.push({id:crypto.randomUUID(),name:'שירות חדש',price:0});priceList()};$('#prices').onclick=e=>{if(e.target.dataset.del){data.prices=data.prices.filter(p=>p.id!==e.target.dataset.del);priceList()}};$('#savePrices').onclick=()=>{$('#prices').querySelectorAll('input').forEach(i=>{const p=data.prices.find(x=>x.id===i.dataset.id);p[i.dataset.k]=i.dataset.k==='price'?Number(i.value):i.value});save('המחירון עודכן');$('#priceDialog').close();toast('המחירון נשמר')}}
function backup(){const blob=new Blob([JSON.stringify({...data,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`ayelet-miller-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);toast('קובץ הגיבוי הורד')}
function settings(){$('#settingsContent').innerHTML=`<div class="dialog-head"><div><p class="eyebrow">גישה מכל מכשיר</p><h2>סנכרון וגיבוי</h2></div><button class="close" onclick="settingsDialog.close()">×</button></div><p>${cloudSession?'הסנכרון המאובטח פעיל. הנתונים זמינים בכל מכשיר עם אותה כתובת מייל.':'כרגע המידע נשמר במכשיר זה בלבד.'}</p><div class="detail-actions"><button class="primary" id="exportNow">הורדת גיבוי</button><button class="secondary" id="restoreNow">שחזור מגיבוי</button>${cloudSession?'<button class="secondary" id="logoutNow">יציאה מהחשבון</button>':''}</div>`;$('#settingsDialog').showModal();$('#exportNow').onclick=backup;$('#restoreNow').onclick=()=>$('#restoreInput').click();if($('#logoutNow'))$('#logoutNow').onclick=async()=>{await cloud.auth.signOut();cloudSession=null;$('#settingsDialog').close();$('#loginDialog').showModal()}}
$('#todayLabel').textContent=new Date().toLocaleDateString('he-IL',{weekday:'long',day:'numeric',month:'long'});
$('#newBookingBtn').onclick=()=>openBooking();$('#bookingForm').addEventListener('submit',submitBooking);$('#bookingForm').addEventListener('input',updateTotals);$('#serviceSelect').onchange=e=>{toggleOtherService();const o=e.target.selectedOptions[0];if(o.dataset.price)$('#bookingForm').elements.servicePrice.value=o.dataset.price;updateTotals()};document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());$('#searchInput').oninput=renderList;$('#statusFilter').onchange=renderList;$('#bookingList').onclick=e=>{const el=e.target.closest('.booking');if(el)detail(el.dataset.id)};$('#bookingList').onkeydown=e=>{if(e.key==='Enter')detail(e.target.closest('.booking')?.dataset.id)};$('#priceListBtn').onclick=priceList;$('#backupBtn').onclick=backup;$('#settingsBtn').onclick=settings;$('#restoreInput').onchange=async e=>{try{const restored=JSON.parse(await e.target.files[0].text());if(!Array.isArray(restored.bookings)||!Array.isArray(restored.prices))throw 0;data={...seed,...restored};save('שוחזר גיבוי');toast('הגיבוי שוחזר בהצלחה')}catch{toast('קובץ הגיבוי אינו תקין')}};
services();render();
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();const email=new FormData(e.currentTarget).get('email');const {error}=await cloud.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});if(error)toast('שליחת הקישור נכשלה');else{$('#loginDialog').close();toast('קישור כניסה נשלח למייל')}});
initCloud();
