const STORE='ayelet-miller-v1';
const SUPABASE_URL='https://tvoriihijpwrxdnayfdq.supabase.co';
const SUPABASE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2b3JpaWhpanB3cnhkbmF5ZmRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMTMwMjcsImV4cCI6MjEwNjc4OTAyN30.f-Bp99AbxVT-WYHtbaR48NvqU9mDfyOVJFRf34Ks91s';
const seed={clients:[],birthdaySettings:{daysAhead:7,message:'מזל טוב {name}! 🎉🎂 מאחלת לך שנה נפלאה מלאה בשמחה וביופי ❤️ לכבוד יום הולדתך מחכה לך הטבה מיוחדת ממני 💄',offer:'',terms:''},birthdaySent:{},bookings:[],prices:[{id:'p1',name:'איפור כלה',price:1800},{id:'p2',name:'איפור ערב',price:450},{id:'p3',name:'ליווי לאירוע',price:900}],history:[]};
let data=load();
let cloud=null,cloudSession=null,syncTimer=null;
const $=s=>document.querySelector(s), money=n=>new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS',maximumFractionDigits:0}).format(Number(n)||0);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function load(){try{return {...structuredClone(seed),...JSON.parse(localStorage.getItem(STORE)||'{}')}}catch{return structuredClone(seed)}}
let localRevision=0,cloudWriteQueue=Promise.resolve(),pendingCloudWrite=false;
function save(action='עדכון נתונים'){data.history.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),action});data.history=data.history.slice(0,250);localRevision++;pendingCloudWrite=true;localStorage.setItem(STORE,JSON.stringify(data));render();return syncCloud()}
function syncCloud(){
  if(!cloudSession||!cloud){toast('נשמר במכשיר בלבד — אין חיבור לענן');return Promise.resolve(false)}
  const snapshot=structuredClone(data),revision=localRevision;
  cloudWriteQueue=cloudWriteQueue.catch(()=>false).then(async()=>{
    try{
      const {error}=await cloud.from('app_state').upsert({workspace_id:'main',user_id:cloudSession.user.id,payload:snapshot,updated_at:new Date().toISOString()},{onConflict:'workspace_id'});
      if(error)throw error;
      if(revision===localRevision)pendingCloudWrite=false;
      toast('השינויים נשמרו בענן בהצלחה');
      return true;
    }catch(error){console.error('Cloud save failed',error);toast('שגיאה בשמירה בענן — הנתונים נשמרו במכשיר בלבד');return false}
  });
  return cloudWriteQueue;
}
async function loadCloud(){
  const revisionAtStart=localRevision;
  const {data:row,error}=await cloud.from('app_state').select('payload').eq('workspace_id','main').maybeSingle();
  if(error){toast('הגישה למאגר לא אושרה');return}
  if(revisionAtStart!==localRevision||pendingCloudWrite){console.warn('Cloud load skipped to protect unsynced local edits');return}
  if(row?.payload){data={...structuredClone(seed),...row.payload};localStorage.setItem(STORE,JSON.stringify(data));render();toast('הנתונים סונכרנו')}
  else syncCloud()
}
async function initCloud(){
  if(['127.0.0.1','localhost'].includes(location.hostname)){document.documentElement.classList.add('auth-ready');return}
  if(!window.supabase){toast('אין חיבור לשירות הנתונים');$('#loginDialog').showModal();document.documentElement.classList.add('auth-ready');return}
  try{
    cloud=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{experimental:{passkey:true}}});
    const {data:{session}}=await cloud.auth.getSession();
    cloudSession=session;
    cloud.auth.onAuthStateChange(async(event,next)=>{
      cloudSession=next;
      if(next){
        // A genuine fresh sign-in is sufficient to clear an old local inactivity lock.
        // Token refresh and restored sessions must never unlock the screen.
        if(event==='SIGNED_IN' && idleLocked){
          idleSetLocked(false);
          idleWrite(IDLE_LAST_KEY,Date.now());
        }
        if(!idleLocked){
          if($('#loginDialog').open)$('#loginDialog').close();
          idleStart();
          await loadCloud();
        }
      }else if(event==='SIGNED_OUT'&&!idleLocked){
        idleWrite(IDLE_LOCK_KEY,'0');
        if(!$('#loginDialog').open)$('#loginDialog').showModal();
      }
    });
    if(session){idleStart();await loadCloud()}
    else {idleWrite(IDLE_LOCK_KEY,'0');$('#loginDialog').showModal()}
  }catch(error){console.error('Supabase initialization failed',error);toast('לא ניתן להשלים התחברות');if(!$('#loginDialog').open)$('#loginDialog').showModal()}
  finally{document.documentElement.classList.add('auth-ready')}
}

const passkeySupported=()=>window.isSecureContext&&!!window.PublicKeyCredential;
function passkeyMessage(error){
  const code=error?.code||error?.error_code||'';
  if(code==='passkey_disabled')return 'יש להפעיל Passkeys בלוח הבקרה של Supabase';
  if(code==='webauthn_credential_not_found')return 'לא נמצא מפתח כניסה רשום לחשבון. היכנסו במייל ורשמו את המכשיר בהגדרות';
  if(error?.name==='NotAllowedError'||error?.name==='AbortError')return 'הזיהוי בוטל או לא אושר';
  if(code==='webauthn_credential_exists')return 'המכשיר כבר נרשם לחשבון';
  if(code==='webauthn_verification_failed')return 'אימות המכשיר נכשל — נסו שוב';
  return 'זיהוי באמצעות המכשיר נכשל. אפשר להיכנס במייל';
}
function toggleEmailLogin(){
  const f=$('#loginForm');
  f.hidden=!f.hidden;
  $('#emailLoginToggle').textContent=f.hidden?'כניסה ראשונה / כניסה באמצעות מייל':'הסתרת הכניסה במייל';
  if(!f.hidden)f.elements.email.focus();
}
async function signInWithDevice(){
  if(!cloud||!passkeySupported()||typeof cloud.auth.signInWithPasskey!=='function'){
    toast('כניסה עם Face ID / Touch ID אינה זמינה כרגע. אפשר להיכנס במייל');return
  }
  const btn=$('#passkeyLoginBtn');
  if(btn){btn.disabled=true;btn.textContent='מתבצע זיהוי במכשיר...'}
  try{
    const {error}=await cloud.auth.signInWithPasskey();
    if(error){console.warn('Passkey sign in',error);toast(passkeyMessage(error))}
  }catch(error){console.warn('Passkey sign in',error);toast(passkeyMessage(error))}
  finally{if(btn){btn.disabled=false;btn.textContent='כניסה עם Face ID / Touch ID'}}
}
async function registerDevicePasskey(){
  if(!cloudSession||!cloud){toast('יש להתחבר קודם באמצעות המייל');return}
  if(!passkeySupported()||typeof cloud.auth.registerPasskey!=='function'){
    toast('המכשיר או הדפדפן אינם תומכים כרגע ברישום Passkey');return
  }
  const btn=$('#registerPasskeyBtn');
  if(btn){btn.disabled=true;btn.textContent='ממתין לאישור המכשיר...'}
  try{
    const {error}=await cloud.auth.registerPasskey();
    if(error){console.warn('Passkey registration',error);toast(passkeyMessage(error));return}
    toast('המכשיר נרשם בהצלחה לכניסה מאובטחת');
  }catch(error){console.warn('Passkey registration',error);toast(passkeyMessage(error))}
  finally{if(btn){btn.disabled=false;btn.textContent='הפעלת Face ID / Touch ID למכשיר'}}
}


const IDLE_LOCK_MS=5*60*1000;
const IDLE_LAST_KEY='ayelet-idle-last-active-v1';
const IDLE_LOCK_KEY='ayelet-idle-locked-v1';
let idleLocked=false,idleStarted=false,idleUnlocking=false,idleExpectedUserId=null,lastIdleActivity=0;
const idleStamp=()=>{try{return Number(localStorage.getItem(IDLE_LAST_KEY))||0}catch{return 0}};
const idleFlag=()=>{try{return localStorage.getItem(IDLE_LOCK_KEY)==='1'}catch{return false}};
function idleWrite(key,value){try{localStorage.setItem(key,String(value))}catch(error){console.warn('Could not store idle lock state',error)}}
function idleMarkActivity(){
  if(idleLocked||document.hidden||!cloudSession)return;
  const now=Date.now();
  if(now-lastIdleActivity<1000)return;
  lastIdleActivity=now;
  idleWrite(IDLE_LAST_KEY,now);
}
function idleSetLocked(locked){
  idleLocked=locked;
  const panel=$('#idleLock');
  panel.hidden=!locked;
  document.body.classList.toggle('idle-locked',locked);
  idleWrite(IDLE_LOCK_KEY,locked?'1':'0');
  if(locked){idleExpectedUserId=cloudSession?.user?.id||idleExpectedUserId;panel.querySelector('#idleLockStatus').textContent='המערכת ננעלה לאחר 5 דקות ללא פעילות.';}
  else {idleExpectedUserId=null;idleMarkActivity()}
}
function idleCheck(){
  if(!cloudSession||idleLocked)return;
  const previous=idleStamp();
  if(previous&&Date.now()-previous>=IDLE_LOCK_MS)idleSetLocked(true);
}
function idleStart(){
  if(!cloudSession)return;
  if(!idleStarted){
    idleStarted=true;
    for(const evt of ['pointerdown','keydown','input','touchstart'])document.addEventListener(evt,idleMarkActivity,{passive:true,capture:true});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)idleCheck()});
    window.addEventListener('focus',idleCheck);
    window.addEventListener('pageshow',idleCheck);
    setInterval(idleCheck,10000);
  }
  if(idleFlag()||(idleStamp()&&Date.now()-idleStamp()>=IDLE_LOCK_MS))idleSetLocked(true);
  else idleMarkActivity();
}
async function idleUnlockWithPasskey(){
  if(idleUnlocking||!idleLocked)return;
  const status=$('#idleLockStatus');
  if(!passkeySupported()||!cloud||typeof cloud.auth.signInWithPasskey!=='function'){
    status.textContent='זיהוי מכשיר אינו זמין. אפשר להיכנס מחדש באמצעות המייל.';return;
  }
  const expected=idleExpectedUserId;
  const button=$('#idleUnlockBtn');
  idleUnlocking=true;button.disabled=true;status.textContent='מאמת את זהותך במכשיר...';
  try{
    const {data:result,error}=await cloud.auth.signInWithPasskey();
    if(error)throw error;
    const current=result?.user?.id||result?.session?.user?.id;
    if(!current||current!==expected){
      status.textContent='מפתח הכניסה שייך לחשבון אחר. יש להתחבר מחדש עם המייל המתאים.';
      await cloud.auth.signOut();
      cloudSession=null;
      return;
    }
    idleSetLocked(false);
    status.textContent='זוהית בהצלחה';
  }catch(error){
    console.warn('Idle passkey unlock failed',error);
    status.textContent=passkeyMessage(error);
  }finally{idleUnlocking=false;button.disabled=false}
}
async function idleUseEmail(){
  if(!idleLocked||idleUnlocking)return;
  // Do not sign out: the existing Supabase session is needed for seamless sync.
  const form=$('#idlePasswordForm');
  form.hidden=!form.hidden;
  $('#idlePasswordFeedback').textContent='';
  if(!form.hidden)form.elements.email.focus();
}
async function idleUnlockWithPassword(){
  if(!idleLocked||idleUnlocking||!cloud)return;
  const form=$('#idlePasswordForm'),feedback=$('#idlePasswordFeedback');
  const email=String(form.elements.email.value||'').trim();
  const password=form.elements.password.value;
  const expected=idleExpectedUserId;
  idleUnlocking=true;
  const button=form.querySelector('button[type="submit"]');
  button.disabled=true;feedback.textContent='מאמת פרטי התחברות...';
  try{
    const {data:result,error}=await cloud.auth.signInWithPassword({email,password});
    if(error)throw error;
    if(!result?.user?.id||result.user.id!==expected){
      // Never expose the previous user's cached customer data to another account.
      await cloud.auth.signOut();
      cloudSession=null;
      feedback.textContent='החשבון שונה מהחשבון שננעל. יש להתחבר מחדש לחשבון המתאים.';
      return;
    }
    cloudSession=result.session;
    form.reset();form.hidden=true;
    idleSetLocked(false);
    feedback.textContent='';
  }catch(error){
    console.warn('Idle password unlock failed',error?.code||error?.name);
    feedback.textContent='לא ניתן לאמת את הפרטים. בדקו את המייל והסיסמה.';
  }finally{idleUnlocking=false;button.disabled=false}
}


async function idleRestartEmailAuthentication(){
  if(idleUnlocking)return;
  // Explicit user-requested recovery: revoke this browser session and start a fresh email login.
  // Cached customer records remain concealed behind the login dialog.
  try{if(cloud)await cloud.auth.signOut()}catch(error){console.warn('Email recovery sign-out failed',error?.code||error?.name)}
  cloudSession=null;
  idleSetLocked(false);
  idleWrite(IDLE_LAST_KEY,Date.now());
  const dialog=$('#loginDialog');
  if(!dialog.open)dialog.showModal();
  if($('#loginForm').hidden)toggleEmailLogin();
}


async function signInWithAccountPassword(){
  const form=$('#passwordLoginForm'), feedback=$('#passwordLoginFeedback'),button=form.querySelector('button[type="submit"]');
  const email=String(form.elements.email.value||'').trim(),password=form.elements.password.value;
  if(!cloud){feedback.textContent='אין חיבור לשירות ההתחברות';return}
  button.disabled=true;feedback.textContent='מאמת פרטי התחברות...';
  try {
    const {error}=await cloud.auth.signInWithPassword({email,password});
    if(error){console.warn('Password sign in',error.code||error.message);feedback.textContent='הכניסה נכשלה. בדקו את הפרטים, או הגדירו סיסמה מתוך החשבון המחובר.'}
    else {form.elements.password.value='';feedback.textContent='התחברת בהצלחה'}
  }catch(error){console.warn('Password sign in',error);feedback.textContent='שגיאת תקשורת. נסו שוב.'}
  finally{button.disabled=false}
}
async function setAccountPassword(){
  const form=$('#setPasswordForm'),feedback=$('#setPasswordFeedback'),button=form.querySelector('button[type="submit"]');
  if(!cloudSession||!cloud){feedback.textContent='נדרשת התחברות לחשבון';return}
  const password=form.elements.newPassword.value,confirmation=form.elements.confirmPassword.value;
  if(password.length<12){feedback.textContent='הסיסמה צריכה להכיל 12 תווים לפחות';return}
  if(password!==confirmation){feedback.textContent='הסיסמאות אינן תואמות';return}
  button.disabled=true;feedback.textContent='שומר סיסמה...';
  try{
    const {error}=await cloud.auth.updateUser({password});
    if(error){console.warn('Password update',error.code||error.message);feedback.textContent='העדכון נכשל. ייתכן שנדרש אימות מחדש של החשבון.'}
    else{form.reset();feedback.textContent='הסיסמה הוגדרה בהצלחה בחשבון שלך.'}
  }catch(error){console.warn('Password update',error);feedback.textContent='העדכון נכשל עקב שגיאת תקשורת.'}
  finally{button.disabled=false}
}
function togglePasswordLogin(){
  const f=$('#passwordLoginForm');
  f.hidden=!f.hidden;
  $('#passwordLoginToggle').textContent=f.hidden?'כניסה באמצעות מייל וסיסמה':'הסתרת כניסה עם סיסמה';
  if(!f.hidden)f.elements.email.focus();
}


let activeView='bookings';
const normalizeName=s=>String(s||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('he-IL');
function normalizePhone(s){const n=String(s||'').replace(/[\s().-]/g,'');const local=n.startsWith('+972')?'0'+n.slice(4):n.startsWith('972')?'0'+n.slice(3):n;return /^05[0-9]{8}$/.test(local)?local:null}
function ensureClients(){
  if(!Array.isArray(data.clients))data.clients=[];
  if(!data.birthdaySettings)data.birthdaySettings=structuredClone(seed.birthdaySettings);
  if(!data.birthdaySent)data.birthdaySent={};
  for(const b of data.bookings){
    const phone=normalizePhone(b.phone);if(!phone)continue;
    let c=data.clients.find(x=>x.id===b.clientId)||data.clients.find(x=>normalizePhone(x.phone)===phone);
    if(!c){c={id:crypto.randomUUID(),fullName:b.clientName||'',phone,email:b.email||'',birthday:'',city:'',street:'',houseNumber:'',apartment:'',type:'',notes:'',marketingConsent:false,createdAt:b.createdAt||new Date().toISOString()};data.clients.push(c)}
    if(!b.clientId)b.clientId=c.id;
  }
}
function birthdayDays(c){
  if(!/^\d{2}-\d{2}$/.test(c.birthday||''))return null;
  const [m,d]=c.birthday.split('-').map(Number),today=new Date();today.setHours(0,0,0,0);
  for(let year=today.getFullYear();year<=today.getFullYear()+4;year++){
    const next=new Date(year,m-1,d);if(next.getMonth()!==m-1||next.getDate()!==d)continue;
    const days=Math.round((next-today)/86400000);if(days>=0)return {days,year};
  }
  return null;
}
function setView(view){
  activeView=view;$('#bookingsView').hidden=view!=='bookings';$('#clientsView').hidden=view!=='clients';
  document.querySelectorAll('.bottom-nav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  if(view==='clients')renderClients();
}
function renderClients(){
  ensureClients();const q=($('#clientSearch')?.value||'').trim().toLowerCase(),days=Number(data.birthdaySettings.daysAhead)||7;
  const digits=q.replace(/\D/g,'');const items=data.clients.filter(c=>!q||String(c.fullName||'').toLowerCase().includes(q)||(digits&&String(c.phone||'').replace(/\D/g,'').includes(digits))||String(c.email||'').toLowerCase().includes(q));
  $('#clientCount').textContent=data.clients.length;
  const soon=data.clients.map(c=>({c,b:birthdayDays(c)})).filter(x=>x.b&&x.b.days<=days).sort((a,b)=>a.b.days-b.b.days);
  $('#birthdayCount').textContent=soon.length;
  $('#birthdayList').innerHTML=soon.length?soon.map(({c,b})=>{
    const sent=!!data.birthdaySent[c.id+'-'+b.year];
    return '<div class="client-row"><div><strong>🎂 '+esc(c.fullName)+'</strong><small>בעוד '+b.days+' ימים · '+esc(c.phone)+'</small><small>'+(c.marketingConsent?'אישרה קבלת הטבות':'לא סומנה הסכמה שיווקית')+'</small></div><button class="secondary" data-birthday="'+esc(c.id)+'" '+(!c.marketingConsent||sent?'disabled':'')+'>'+(sent?'סומנה כנשלחה':c.marketingConsent?'ברכה ב-WhatsApp':'נדרשת הסכמה')+'</button></div>'
  }).join(''):'<p class="client-muted">אין ימי הולדת בטווח שנבחר.</p>';
  $('#clientList').innerHTML=items.length?items.slice().sort((a,b)=>a.fullName.localeCompare(b.fullName,'he')).map(c=>'<div class="client-row"><div><strong>'+esc(c.fullName)+'</strong><small>'+esc(c.phone)+(c.email?' · '+esc(c.email):'')+'</small><small>'+data.bookings.filter(b=>b.clientId===c.id).length+' הזמנות'+(c.birthday?' · 🎂 '+esc(c.birthday):'')+'</small></div><button class="secondary" data-edit-client="'+esc(c.id)+'">פתיחה</button></div>').join(''):'<p class="client-muted">לא נמצאו לקוחות.</p>';
}
function openClient(id){
  ensureClients();const c=data.clients.find(x=>x.id===id),f=$('#clientForm');f.reset();
  for(const k of ['id','fullName','phone','email','city','street','houseNumber','apartment','notes'])if(f.elements[k])f.elements[k].value=c?.[k]||'';
  const parts=(c?.birthday||'').split('-');f.elements.birthMonth.value=parts[0]||'';f.elements.birthDay.value=parts[1]||'';const selected=c?.services|| (c?.type?[c.type]:[]);f.querySelectorAll('[name="services"]').forEach(el=>el.checked=selected.includes(el.value));f.elements.marketingConsent.checked=!!c?.marketingConsent;
  $('#clientDialogTitle').textContent=c?'עריכת לקוחה':'לקוחה חדשה';
  $('#clientHistory').textContent=c?'הזמנות קודמות: '+data.bookings.filter(b=>b.clientId===c.id).map(b=>b.eventDate+' · '+b.service).join(' | '):'';
  $('#clientDialog').showModal();
}
async function submitClient(e){
  e.preventDefault();const f=e.currentTarget,o=Object.fromEntries(new FormData(f)),id=o.id,phone=normalizePhone(o.phone);o.services=Array.from(f.querySelectorAll('[name="services"]:checked'),el=>el.value);o.birthday=o.birthMonth&&o.birthDay?o.birthMonth+'-'+o.birthDay:'';delete o.birthMonth;delete o.birthDay;delete o.type;
  if(!phone){const el=f.elements.phone;el.setCustomValidity('יש להזין מספר נייד ישראלי תקין בן 10 ספרות');el.reportValidity();el.focus();return}
  o.fullName=o.fullName.trim().replace(/\s+/g,' ');
  if(o.fullName.split(' ').length<2){toast('יש להזין שם פרטי ושם משפחה');return}
  const duplicatePhone=data.clients.find(c=>c.id!==id&&normalizePhone(c.phone)===phone);
  if(duplicatePhone){toast('הטלפון כבר שייך ללקוחה '+duplicatePhone.fullName);return}
  const sameName=data.clients.find(c=>c.id!==id&&normalizeName(c.fullName)===normalizeName(o.fullName));
  if(sameName&&!confirm('כבר קיימת לקוחה בשם '+sameName.fullName+'. האם מדובר בלקוחה אחרת?'))return;
  if((f.elements.birthMonth.value&&!f.elements.birthDay.value)||(!f.elements.birthMonth.value&&f.elements.birthDay.value)){toast('יש לבחור גם יום וגם חודש ליום ההולדת');return}if(o.birthday){const [m,d]=o.birthday.split('-').map(Number),v=new Date(2024,m-1,d);if(v.getMonth()!==m-1||v.getDate()!==d){toast('תאריך יום ההולדת אינו תקין');return}}
  o.phone=phone;o.email=o.email.trim().toLowerCase();o.marketingConsent=f.elements.marketingConsent.checked;
  const old=data.clients.find(c=>c.id===id);
  const c={...old,...o,id:id||crypto.randomUUID(),createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  if(old)Object.assign(old,c);else data.clients.push(c);
  if(old)for(const b of data.bookings.filter(b=>b.clientId===id)){b.clientName=c.fullName;b.phone=c.phone;b.email=c.email}
  $('#clientDialog').close();$('#clientSearch').value='';setView('clients');toast('הלקוחה נשמרה במכשיר, מעדכנים את הענן...');await save('עודכן כרטיס לקוחה: '+c.fullName);
}
function syncBookingClient(obj){
  ensureClients();const phone=normalizePhone(obj.phone);
  if(!phone){toast('יש להזין מספר נייד ישראלי תקין');return false}
  obj.phone=phone;obj.clientName=obj.clientName.trim().replace(/\s+/g,' ');
  if(obj.clientName.split(' ').length<2){toast('יש להזין שם פרטי ושם משפחה');return false}
  const existing=data.clients.find(c=>normalizePhone(c.phone)===phone);
  if(existing){
    if(normalizeName(existing.fullName)!==normalizeName(obj.clientName)&&!confirm('הטלפון שייך ל'+existing.fullName+'. לקשר את ההזמנה ללקוחה זו?'))return false;
    obj.clientId=existing.id;obj.clientName=existing.fullName;
    if(obj.email&&!existing.email)existing.email=obj.email;
  }else{
    const same=data.clients.find(c=>normalizeName(c.fullName)===normalizeName(obj.clientName));
    if(same&&!confirm('כבר קיימת לקוחה בשם '+same.fullName+' עם טלפון אחר. ליצור לקוחה נוספת?'))return false;
    const c={id:crypto.randomUUID(),fullName:obj.clientName,phone,email:obj.email||'',birthday:'',marketingConsent:false,createdAt:new Date().toISOString()};
    data.clients.push(c);obj.clientId=c.id;
  }
  return true;
}
function birthdayWhatsApp(id){
  const c=data.clients.find(x=>x.id===id),b=c&&birthdayDays(c);if(!c||!b||!c.marketingConsent)return;
  const settings=data.birthdaySettings;
  const message=settings.message.replaceAll('{name}',c.fullName.split(' ')[0])+(settings.offer?'\\n\\n'+settings.offer:'')+(settings.terms?'\\n'+settings.terms:'');
  const url='https://wa.me/972'+c.phone.slice(1)+'?text='+encodeURIComponent(message);
  window.open(url,'_blank','noopener,noreferrer');
  if(confirm('האם שלחת את הברכה בפועל ב-WhatsApp?')){data.birthdaySent[id+'-'+b.year]=new Date().toISOString();save('ברכת יום הולדת סומנה כנשלחה ל'+c.fullName)}
}
function editBirthdaySettings(){
  const x=data.birthdaySettings;
  const days=prompt('כמה ימים מראש להציג ימי הולדת?',String(x.daysAhead));if(days===null)return;
  const message=prompt('נוסח ברכה. {name} יוחלף בשם הפרטי:',x.message);if(message===null)return;
  const offer=prompt('הטבת יום הולדת (אפשר להשאיר ריק):',x.offer);if(offer===null)return;
  const terms=prompt('תנאי ההטבה ותוקף (אפשר להשאיר ריק):',x.terms);if(terms===null)return;
  data.birthdaySettings={daysAhead:Math.min(60,Math.max(1,Number(days)||7)),message,offer,terms};save('עודכנו הגדרות ימי הולדת');
}

function calc(b){const total=Number(b.servicePrice||0)+Number(b.travelPrice||0),paid=b.depositStatus==='שולמה'?Number(b.depositAmount||0):0;return {total,paid,balance:Math.max(0,total-paid)}}
let toastTimeout;
function toast(t){
 const dialog=Array.from(document.querySelectorAll('dialog[open]')).at(-1);
 const el=dialog?.querySelector('.dialog-feedback')||$('#toast');
 el.textContent=t;el.classList.add('show');clearTimeout(toastTimeout);
 toastTimeout=setTimeout(()=>{el.classList.remove('show');if(el.classList.contains('dialog-feedback'))el.textContent=''},4500)
}
function render(){ensureClients();const now=new Date(),upcoming=data.bookings.filter(b=>b.status!=='בוטלה'&&new Date(`${b.eventDate}T${b.eventTime||'00:00'}`)>=new Date(now.toDateString())).sort((a,b)=>a.eventDate.localeCompare(b.eventDate));const open=data.bookings.filter(b=>!['הושלמה','בוטלה'].includes(b.status));const due=open.reduce((n,b)=>n+calc(b).balance,0);$('#stats').innerHTML=`<div class="stat"><span>אירועים קרובים</span><strong>${upcoming.length}</strong></div><div class="stat"><span>הזמנות פעילות</span><strong>${open.length}</strong></div><div class="stat"><span>לקוחות</span><strong>${data.clients.length}</strong></div><div class="stat"><span>יתרות פתוחות</span><strong>${money(due)}</strong></div>`;renderList();if(activeView==='clients')renderClients()}
function renderList(){const q=$('#searchInput').value.trim().toLowerCase(),sf=$('#statusFilter').value;const items=data.bookings.filter(b=>(!q||b.clientName.toLowerCase().includes(q)||b.phone.replace(/\D/g,'').includes(q.replace(/\D/g,'')))&&(!sf||b.status===sf)).sort((a,b)=>`${a.eventDate}${a.eventTime}`.localeCompare(`${b.eventDate}${b.eventTime}`));$('#emptyState').hidden=items.length>0;$('#bookingList').innerHTML=items.map(b=>{const d=new Date(`${b.eventDate}T12:00:00`),c=calc(b);return `<article class="booking" data-id="${b.id}" tabindex="0"><div class="datebox"><strong>${d.getDate()}</strong><span>${d.toLocaleDateString('he-IL',{month:'short'})}</span></div><div class="meta"><strong>${esc(b.clientName)}</strong><small>${esc(b.phone)} · ${esc(b.location||'ללא מיקום')}</small></div><div class="service">${esc(b.service)}</div><div class="money">${money(c.balance)}<small> יתרה</small></div><span class="badge ${b.status==='הושלמה'?'done':''}">${esc(b.status)}</span></article>`}).join('')}
function services(){const s=$('#serviceSelect');s.innerHTML=data.prices.map(p=>`<option value="${esc(p.name)}" data-price="${p.price}">${esc(p.name)}</option>`).join('')+`<option value="אחר">אחר</option>`}
function toggleOtherService(){const f=$('#bookingForm'),isOther=f.elements.serviceSelection.value==='אחר',field=$('#otherServiceField'),input=$('#serviceOtherInput');field.hidden=!isOther;input.required=isOther;if(!isOther)input.value=''}
function openBooking(b){services();const f=$('#bookingForm');f.reset();f.elements.id.value=b?.id||'';f.elements.makeupCount.value=b?.makeupCount||1;$('#dialogTitle').textContent=b?'עריכת הזמנה':'הזמנה חדשה';if(b){Object.entries(b).forEach(([k,v])=>{if(f.elements[k]&&!['serviceSelection','serviceOther'].includes(k))f.elements[k].value=v});const known=data.prices.some(p=>p.name===b.service)&&b.serviceIsOther!=='true';f.elements.serviceSelection.value=known?b.service:'אחר';f.elements.serviceOther.value=known?'':b.service}else{f.elements.eventDate.value=new Date().toISOString().slice(0,10);const p=data.prices[0];if(p){f.elements.serviceSelection.value=p.name;f.elements.servicePrice.value=p.price}}toggleOtherService();updateTotals();const deleteBtn=$('#deleteBookingFromForm');deleteBtn.hidden=!b?.id;deleteBtn.onclick=()=>{if(!b?.id)return;deleteBooking(b.id)};$('#bookingDialog').showModal()}
function updateTotals(){const f=$('#bookingForm'),c=calc({servicePrice:f.elements.servicePrice.value,travelPrice:f.elements.travelPrice.value,depositAmount:f.elements.depositAmount.value,depositStatus:f.elements.depositStatus.value});$('#liveTotals').innerHTML=`<span>סה״כ<strong>${money(c.total)}</strong></span><span>שולם<strong>${money(c.paid)}</strong></span><span>יתרה לתשלום<strong>${money(c.balance)}</strong></span>`}
function submitBooking(event){event.preventDefault();const f=$('#bookingForm'),obj=Object.fromEntries(new FormData(f)),isOther=obj.serviceSelection==='אחר';obj.service=isOther?obj.serviceOther.trim():obj.serviceSelection;obj.serviceIsOther=String(isOther);delete obj.serviceSelection;delete obj.serviceOther;if(!obj.service){toast('יש לציין את סוג השירות');return}if(!Number.isInteger(Number(obj.makeupCount))||Number(obj.makeupCount)<1){toast('יש להזין כמות מאופרות תקינה');return}if(!syncBookingClient(obj))return;obj.id=obj.id||crypto.randomUUID();obj.updatedAt=new Date().toISOString();const i=data.bookings.findIndex(x=>x.id===obj.id);if(i>=0)data.bookings[i]={...data.bookings[i],...obj};else{obj.createdAt=obj.updatedAt;data.bookings.push(obj)}$('#bookingDialog').close();save(`${i>=0?'עודכנה':'נוצרה'} הזמנה עבור ${obj.clientName}`);toast('ההזמנה נשמרה')}
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

// Generate a real PDF file rather than asking iOS Safari to print a dynamically opened HTML page.
async function createAgreementPdf(id){
 const b=data.bookings.find(x=>x.id===id);
 if(!b){toast('ההזמנה לא נמצאה');return null}
 if(typeof html2pdf!=='function'){toast('רכיב יצירת PDF לא נטען. נסו לרענן את הדף');return null}
 const holder=document.createElement('div');
 holder.setAttribute('dir','rtl');
 holder.style.cssText='position:fixed;left:-10000px;top:0;width:794px;max-width:none;background:#fff;z-index:-1;pointer-events:none;';
 holder.innerHTML=agreementHtml(b);
 document.body.appendChild(holder);
 try{
   if(document.fonts&&document.fonts.ready)await document.fonts.ready;
   const images=Array.from(holder.querySelectorAll('img'));
   await Promise.all(images.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true})})));
   const options=agreementOptions(b);
   options.pagebreak={mode:['css','legacy'],avoid:['.signature-row','.agreement-header','.agreement-payment-total']};
   const blob=await html2pdf().set(options).from(holder.querySelector('.agreement')||holder).toPdf().outputPdf('blob');
   if(!blob||blob.size<1000)throw new Error('PDF was empty');
   return {blob,filename:options.filename};
 }catch(error){
   console.error('Agreement PDF generation failed',error);
   toast('יצירת PDF נכשלה. נסו שוב ב-Safari או במחשב');
   return null;
 }finally{holder.remove()}
}
function saveAgreementBlob(blob,filename){
 const url=URL.createObjectURL(blob);
 const link=document.createElement('a');
 link.href=url;link.download=filename;
 document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function downloadAgreement(id){
 toast('מכינה קובץ PDF...');
 const result=await createAgreementPdf(id);
 if(!result)return;
 saveAgreementBlob(result.blob,result.filename);
 toast('קובץ ההסכם הוכן להורדה');
}
async function shareAgreement(id){
 toast('מכינה קובץ PDF לשיתוף...');
 const result=await createAgreementPdf(id);
 if(!result)return;
 const file=new File([result.blob],result.filename,{type:'application/pdf'});
 if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){
   try{await navigator.share({files:[file],title:'הסכם איפור'});return}
   catch(error){if(error.name==='AbortError')return;console.error('PDF share failed',error)}
 }
 saveAgreementBlob(result.blob,result.filename);
 toast('ה-PDF הורד. ניתן לשתף אותו דרך קבצים או WhatsApp');
}
async function shareAgreementWhatsApp(id){
 const b=data.bookings.find(x=>x.id===id);
 if(!b){toast('ההזמנה לא נמצאה');return}
 const message='שלום '+b.clientName+', מצורף הסכם שירותי האיפור של איילת מילר. אשמח שתעייני בהסכם ותחזירי אותו חתום. תודה רבה!';
 toast('מכינה PDF והודעה ל-WhatsApp...');
 const result=await createAgreementPdf(id);
 if(!result)return;
 const file=new File([result.blob],result.filename,{type:'application/pdf'});
 if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){
   try{await navigator.share({files:[file],text:message,title:'הסכם איפור – איילת מילר'});return}
   catch(error){if(error.name==='AbortError')return;console.error('WhatsApp share failed',error)}
 }
 saveAgreementBlob(result.blob,result.filename);
 const phone=String(b.phone||'').replace(/\D/g,'').replace(/^0/,'972');
 if(phone)window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(message),'_blank','noopener');
 toast('ה-PDF הורד. יש לצרף אותו ידנית לשיחת WhatsApp');
}
window.shareAgreementWhatsApp=shareAgreementWhatsApp;
window.downloadAgreement=downloadAgreement;
window.shareAgreement=shareAgreement;
function detail(id){const b=data.bookings.find(x=>x.id===id);if(!b)return;const phone=b.phone.replace(/\D/g,'').replace(/^0/,'972'),hist=data.history.filter(h=>h.action.includes(b.clientName)).slice(0,8);$('#detailsContent').innerHTML=`<div class="dialog-head"><div><p class="eyebrow">${esc(b.status)}</p><h2>${esc(b.clientName)} · ${dateHe(b.eventDate)}</h2></div><button class="close" onclick="detailsDialog.close()">×</button></div><div class="detail-actions"><button class="primary" onclick="downloadAgreement('${b.id}')">הסכם להורדה כ-PDF</button><button class="secondary" onclick="shareAgreement('${b.id}')">שיתוף ההסכם</button><button class="secondary" onclick="downloadAgreement('${b.id}')">הדפסה</button><button class="secondary" onclick="editBooking('${b.id}')">עריכה</button><button class="secondary" onclick="duplicateBooking('${b.id}')">שכפול</button><button class="secondary danger-action" onclick="deleteBooking('${b.id}')">מחיקת הזמנה</button><button class="secondary" onclick="shareAgreementWhatsApp('${b.id}')">הסכם לשיתוף ב-WhatsApp</button></div>${agreementHtml(b)}${b.internalNotes?`<aside class="internal-note"><strong>הערה פנימית - אינה מופיעה בקובץ:</strong><br>${esc(b.internalNotes).replace(/\n/g,'<br>')}</aside>`:''}<h3>היסטוריית שינויים</h3><div class="timeline">${hist.map(h=>`<div><strong>${esc(h.action)}</strong><small> · ${new Date(h.at).toLocaleString('he-IL')}</small></div>`).join('')||'אין שינויים קודמים'}</div>`;$('#detailsDialog').showModal()}
window.deleteBooking=id=>{const b=data.bookings.find(x=>x.id===id);if(!b)return;if(!confirm('למחוק לצמיתות את ההזמנה של '+b.clientName+' מתאריך '+dateHe(b.eventDate)+'?\\nכרטיס הלקוחה יישמר במאגר.'))return;data.bookings=data.bookings.filter(x=>x.id!==id);$('#detailsDialog').close();if($('#bookingDialog').open)$('#bookingDialog').close();save('נמחקה הזמנה עבור '+b.clientName+' בתאריך '+dateHe(b.eventDate));toast('ההזמנה נמחקה. הלקוחה נשארה במאגר')};
window.editBooking=id=>{$('#detailsDialog').close();openBooking(data.bookings.find(b=>b.id===id))};
window.duplicateBooking=id=>{const source=data.bookings.find(x=>x.id===id),b={...source,id:'',status:'טיוטה',clientName:source.clientName+' — עותק'};$('#detailsDialog').close();openBooking(b)};
function priceList(){$('#priceContent').innerHTML=`<div class="dialog-head"><div><p class="eyebrow">הגדרות</p><h2>מחירון</h2></div><button class="close" onclick="priceDialog.close()">×</button></div><div id="prices">${data.prices.map(p=>`<div class="price-row"><input value="${esc(p.name)}" data-id="${p.id}" data-k="name"><input type="number" value="${p.price}" data-id="${p.id}" data-k="price"><button class="secondary" data-del="${p.id}">מחיקה</button></div>`).join('')}</div><div class="dialog-actions"><button class="secondary" id="addPrice">הוספת שירות</button><button class="primary" id="savePrices">שמירה</button></div>`;$('#priceDialog').showModal();$('#addPrice').onclick=()=>{data.prices.push({id:crypto.randomUUID(),name:'שירות חדש',price:0});priceList()};$('#prices').onclick=e=>{if(e.target.dataset.del){data.prices=data.prices.filter(p=>p.id!==e.target.dataset.del);priceList()}};$('#savePrices').onclick=()=>{$('#prices').querySelectorAll('input').forEach(i=>{const p=data.prices.find(x=>x.id===i.dataset.id);p[i.dataset.k]=i.dataset.k==='price'?Number(i.value):i.value});save('המחירון עודכן');$('#priceDialog').close();toast('המחירון נשמר')}}
function backup(){const blob=new Blob([JSON.stringify({...data,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`ayelet-miller-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);toast('קובץ הגיבוי הורד')}
function settings(){$('#settingsContent').innerHTML=`<div class="dialog-head"><div><p class="eyebrow">גישה מכל מכשיר</p><h2>סנכרון וגיבוי</h2></div><button class="close" onclick="settingsDialog.close()">×</button></div><p>${cloudSession?'הסנכרון המאובטח פעיל. הנתונים זמינים בכל מכשיר עם אותה כתובת מייל.':'כרגע המידע נשמר במכשיר זה בלבד.'}</p><div class="detail-actions"><button class="primary" id="exportNow">הורדת גיבוי</button><button class="secondary" id="restoreNow">שחזור מגיבוי</button>${cloudSession?'<button class="secondary" id="logoutNow">יציאה מהחשבון</button>':''}</div>${cloudSession?'<div style="margin-top:16px"><p><strong>כניסה מאובטחת במכשיר</strong></p><p>לאחר רישום חד־פעמי תוכלו להיכנס באמצעות Face ID, Touch ID או קוד המכשיר. הכניסה במייל תישאר זמינה.</p><button class="primary" id="registerPasskeyBtn" type="button">הפעלת Face ID / Touch ID למכשיר</button></div>':''}<div style="border-top:1px solid #eadde2;margin-top:16px;padding-top:14px"><p><strong>הגדרת סיסמה כגיבוי ל-Face ID</strong></p><p style="color:#766d71;font-size:.85rem">יש להגדיר סיסמה בנפרד לכל חשבון. היא נשמרת אצל Supabase ולא באפליקציה.</p><form id="setPasswordForm" autocomplete="off"><label style="display:block">סיסמה חדשה (12 תווים לפחות)<input name="newPassword" type="password" minlength="12" autocomplete="new-password" required style="display:block;width:100%;padding:12px;margin:6px 0 12px"></label><label style="display:block">אימות סיסמה<input name="confirmPassword" type="password" minlength="12" autocomplete="new-password" required style="display:block;width:100%;padding:12px;margin:6px 0 12px"></label><button type="submit" class="secondary">שמירת הסיסמה לחשבון</button><p id="setPasswordFeedback" role="status" aria-live="polite"></p></form></div>`;$('#settingsDialog').showModal();if($('#registerPasskeyBtn'))$('#registerPasskeyBtn').onclick=registerDevicePasskey;if($('#setPasswordForm'))$('#setPasswordForm').addEventListener('submit',async event=>{event.preventDefault();await setAccountPassword()});$('#exportNow').onclick=backup;$('#restoreNow').onclick=()=>$('#restoreInput').click();if($('#logoutNow'))$('#logoutNow').onclick=async()=>{await cloud.auth.signOut();cloudSession=null;idleWrite(IDLE_LOCK_KEY,'0');$('#settingsDialog').close();if(!$('#loginDialog').open)$('#loginDialog').showModal()}}
$('#clientForm').addEventListener('submit',submitClient);
$('#newClientBtn').onclick=()=>openClient();
$('#clientSearch').oninput=renderClients;
$('#clientList').onclick=e=>{const id=e.target.closest('[data-edit-client]')?.dataset.editClient;if(id)openClient(id)};
$('#birthdayList').onclick=e=>{const id=e.target.closest('[data-birthday]')?.dataset.birthday;if(id)birthdayWhatsApp(id)};
$('#birthdaySettingsBtn').onclick=editBirthdaySettings;
document.querySelectorAll('.bottom-nav [data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$('#todayLabel').textContent=new Date().toLocaleDateString('he-IL',{weekday:'long',day:'numeric',month:'long'});
$('#newBookingBtn').onclick=()=>openBooking();$('#bookingForm').addEventListener('submit',submitBooking);$('#bookingForm').addEventListener('input',updateTotals);$('#serviceSelect').onchange=e=>{toggleOtherService();const o=e.target.selectedOptions[0];if(o.dataset.price)$('#bookingForm').elements.servicePrice.value=o.dataset.price;updateTotals()};document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());$('#searchInput').oninput=renderList;$('#statusFilter').onchange=renderList;$('#bookingList').onclick=e=>{const el=e.target.closest('.booking');if(el)detail(el.dataset.id)};$('#bookingList').onkeydown=e=>{if(e.key==='Enter')detail(e.target.closest('.booking')?.dataset.id)};$('#priceListBtn').onclick=priceList;$('#backupBtn').onclick=backup;$('#settingsBtn').onclick=settings;$('#restoreInput').onchange=async e=>{try{const restored=JSON.parse(await e.target.files[0].text());if(!Array.isArray(restored.bookings)||!Array.isArray(restored.prices))throw 0;data={...seed,...restored};save('שוחזר גיבוי');toast('הגיבוי שוחזר בהצלחה')}catch{toast('קובץ הגיבוי אינו תקין')}};
services();render();
function emailLoginFeedback(message,success=false){
  const panel=$('#loginEmailFeedback');
  if(panel){panel.textContent=message;panel.hidden=false;panel.style.color=success?'#1e7653':'#a12236'}
}
$('#passwordLoginForm').addEventListener('submit',async event=>{event.preventDefault();await signInWithAccountPassword()});
$('#loginForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const button=e.currentTarget.querySelector('button[type="submit"]');
  const email=String(new FormData(e.currentTarget).get('email')||'').trim();
  if(!cloud){emailLoginFeedback('אין חיבור לשרת ההתחברות. נסו לרענן את העמוד.');return}
  if(button){button.disabled=true;button.textContent='שולח קישור...'}
  try{
    const {error}=await cloud.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});
    if(error){
      console.warn('Supabase email OTP rejected',error.code||error.message);
      const code=error.code||error.error_code||'';
      const rateLimited=error.status===429||code==='over_email_send_rate_limit'||code==='over_request_rate_limit';
      const message=code==='email_address_not_authorized'
        ?'כתובת המייל אינה מורשית לקבל קישורים משירות המייל המובנה של Supabase. יש להוסיף אותה לחברי הארגון או להגדיר SMTP חיצוני.'
        :rateLimited
          ?'הגענו למכסת שליחת קישורים ב-Supabase. נסו שוב מאוחר יותר או הגדירו שירות SMTP.'
          :'לא הצלחנו לשלוח קישור. ניתן לבדוק את הסיבה ביומני Authentication ב-Supabase.';
      emailLoginFeedback(message);
      toast('שליחת הקישור נכשלה');
    }else{
      emailLoginFeedback('הבקשה נשלחה לשרת. בדקו את תיבת הדואר, ספאם וקידומי מכירות. אם הקישור לא הגיע, יש לבדוק את יומני Authentication.',true);
      toast('בקשת קישור כניסה נשלחה');
    }
  }catch(error){
    console.warn('Supabase email OTP request failed',error);
    emailLoginFeedback('שגיאת תקשורת בעת בקשת הקישור. בדקו חיבור ונסו שוב.');
  }finally{if(button){button.disabled=false;button.textContent='שליחת קישור כניסה למייל'}}
});
initCloud();

// Immediate, accessible validation for customer phone numbers.
document.getElementById('clientForm')?.elements.phone?.addEventListener('input',function(){const val=this.value.trim(),valid=!val||!!normalizePhone(val);this.setCustomValidity(valid?'':'יש להזין מספר נייד ישראלי תקין, למשל 050-1234567');const hint=document.getElementById('clientPhoneError');if(hint)hint.textContent=valid?'':'מספר לא תקין: יש להזין 10 ספרות, החל ב־05';});
