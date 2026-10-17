(() => {
  "use strict";
  const STORE = "dailyRoutineChecker.v3";
  const TOKEN_KEY = "daymark.authToken";
 const API_BASE = "/api";
  const $ = id => document.getElementById(id);
  const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const LONG_DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const QUOTES = [
    "You don't have to be perfect. You just have to keep going.",
    "Small steps every day add up to remarkable change.",
    "Consistency is choosing to show up, even when it is ordinary.",
    "Make it easy to start, then let momentum do its work.",
    "Your future self is built by the choices you make today."
  ];
  const ACHIEVEMENTS = [
    {id:"first",icon:"✦",name:"First step",desc:"Complete your first routine",test:s=>totalCompleted(s)>=1},
    {id:"five",icon:"⚡",name:"Getting started",desc:"Complete 5 routines",test:s=>totalCompleted(s)>=5},
    {id:"twentyfive",icon:"🌱",name:"Growing strong",desc:"Complete 25 routines",test:s=>totalCompleted(s)>=25},
    {id:"streak3",icon:"🔥",name:"3-day streak",desc:"Complete a routine 3 days in a row",test:s=>bestStreak(s)>=3},
    {id:"streak7",icon:"🏆",name:"Week of wins",desc:"Complete a routine 7 days in a row",test:s=>bestStreak(s)>=7},
    {id:"hundred",icon:"💯",name:"Century club",desc:"Complete 100 routines",test:s=>totalCompleted(s)>=100}
  ];
  let state = loadState();
  let selectedDate = todayKey();
  let editingAuthMode = "login";
  let token = localStorage.getItem(TOKEN_KEY) || "";
  let toastTimer;
  let syncTimer;

  function todayKey(date = new Date()) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  function parseDay(key) { const [y,m,d]=key.split("-").map(Number); return new Date(y,m-1,d); }
  function shiftDay(key, amount) { const d=parseDay(key); d.setDate(d.getDate()+amount); return todayKey(d); }
  function uid() { return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`); }
  function defaultState() { return {version:3,routines:[],completions:{},settings:{theme:"light",notifications:false},createdAt:new Date().toISOString()}; }
  function loadState() {
    try {
      const raw=localStorage.getItem(STORE);
      if(raw){ const parsed=JSON.parse(raw); if(parsed && Array.isArray(parsed.routines) && parsed.completions) return normalizeState(parsed); }
      // One-time migration from the v2 project storage key, when present.
      const old=localStorage.getItem("dailyRoutineChecker.v2") || localStorage.getItem("dailyRoutineChecker.v1");
      if(old){ const parsed=JSON.parse(old); if(parsed && Array.isArray(parsed.routines)){ const migrated=normalizeState(parsed); localStorage.setItem(STORE,JSON.stringify(migrated)); return migrated; } }
    } catch(e) { console.warn("Could not load saved routines",e); }
    return defaultState();
  }
  function normalizeState(s) {
    const n=defaultState();
    n.routines=(s.routines||[]).map(r=>({id:r.id||uid(),name:String(r.name||"Routine"),category:r.category||"Personal",time:r.time||"",days:Array.isArray(r.days)?r.days:[0,1,2,3,4,5,6],createdAt:r.createdAt||new Date().toISOString()}));
    n.completions=s.completions||s.completed||{};
    n.settings={...n.settings,...(s.settings||{})};
    return n;
  }
  function persist({sync=true}={}) {
    localStorage.setItem(STORE,JSON.stringify(state));
    if(sync && token) scheduleSync();
  }
  function toast(msg) {
    $("toast").textContent=msg; $("toast").classList.add("show");
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>$("toast").classList.remove("show"),2600);
  }
  function completed(id,key) { return Boolean(state.completions[key] && state.completions[key][id]); }
  function setCompleted(id,key,value) {
    if(!state.completions[key]) state.completions[key]={};
    if(value) state.completions[key][id]=true; else delete state.completions[key][id];
    persist(); render(); if(value) checkAchievements();
  }
  function dayRoutines(key) { const day=parseDay(key).getDay(); return state.routines.filter(r=>r.days.includes(day)); }
  function dayCount(key) { const rs=dayRoutines(key); return {total:rs.length,done:rs.filter(r=>completed(r.id,key)).length}; }
  function totalCompleted(s=state) { return Object.values(s.completions||{}).reduce((sum,day)=>sum+Object.values(day||{}).filter(Boolean).length,0); }
  function dayWasSuccessful(key) { const c=dayCount(key); return c.total>0 && c.done===c.total; }
  function currentStreak() {
    let d=todayKey(), count=0;
    // If today is not complete yet, let a streak ending yesterday remain visible.
    if(!dayWasSuccessful(d)) d=shiftDay(d,-1);
    for(let i=0;i<370;i++){ if(dayWasSuccessful(d)){count++;d=shiftDay(d,-1);}else break; }
    return count;
  }
  function bestStreak() {
    const dates=Object.keys(state.completions).sort(); let best=0,run=0,last="";
    for(const date of dates){ if(!dayWasSuccessful(date)) {run=0;last=date;continue;}
      run=last && shiftDay(last,1)===date ? run+1 : 1; best=Math.max(best,run); last=date;
    } return best;
  }
  function weekStart(key) { const d=parseDay(key); d.setDate(d.getDate()-((d.getDay()+6)%7)); return todayKey(d); }
  function getWeekKeys(key=todayKey()) { const start=weekStart(key); return Array.from({length:7},(_,i)=>shiftDay(start,i)); }
  function rateForDay(key) { const c=dayCount(key); return c.total ? Math.round(c.done/c.total*100) : 0; }
  function weeklyAnalytics(key=todayKey()) {
    const keys=getWeekKeys(key); let total=0,done=0;
    const days=keys.map(k=>{const c=dayCount(k);total+=c.total;done+=c.done;return {key:k,...c,rate:c.total?Math.round(c.done/c.total*100):0};});
    return {days,total,done,rate:total?Math.round(done/total*100):0};
  }
  function dateLabel(key,opts={weekday:"short",month:"short",day:"numeric"}) { return parseDay(key).toLocaleDateString(undefined,opts); }

  function render() {
    const now=new Date();
    $("currentDate").textContent=now.toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric",year:"numeric"});
    $("todayLabel").textContent=LONG_DAYS[now.getDay()].toUpperCase()+" • YOUR DAY, YOUR PACE";
    $("dailyQuote").textContent=QUOTES[Math.floor(now.getDate()/3)%QUOTES.length];
    const c=dayCount(selectedDate), pct=c.total?Math.round(c.done/c.total*100):0;
    $("progressPercent").textContent=pct+"%"; $("progressFraction").textContent=`${c.done} of ${c.total} complete`; $("progressBar").style.width=pct+"%";
    $("currentStreak").textContent=currentStreak()+" days"; $("bestStreak").textContent=bestStreak()+" days";
    const analytics=weeklyAnalytics(); $("completionRate").textContent=analytics.rate+"%";
    $("miniBars").innerHTML=analytics.days.map(d=>`<span title="${dateLabel(d.key)}: ${d.rate}%" style="height:${Math.max(10,d.rate)}%"></span>`).join("");
    $("achievementCount").textContent=ACHIEVEMENTS.filter(a=>a.test(state)).length;
    const next=ACHIEVEMENTS.find(a=>!a.test(state)); $("nextAchievement").textContent=next?`Next: ${next.name}`:"All current badges unlocked!";
    renderWeek(); renderRoutines(); renderChart(analytics); renderAchievements(); renderHistory();
    $("historyDate").value=$("historyDate").value||todayKey();
    updateAccountUI();
  }
  function renderWeek() {
    const keys=getWeekKeys(selectedDate);
    $("weekStrip").innerHTML=keys.map(key=>{
      const d=parseDay(key), c=dayCount(key), active=key===selectedDate;
      return `<button class="day-button ${active?"active":""} ${c.total&&c.done===c.total?"has-progress":""}" data-day="${key}" aria-pressed="${active}"><span class="day-name">${DAYS[d.getDay()]}</span><span class="day-num">${d.getDate()}</span><span class="day-dot"></span></button>`;
    }).join("");
    $("selectedDayLabel").textContent=selectedDate===todayKey()?"Today's plan":dateLabel(selectedDate,{weekday:"long",month:"short",day:"numeric"})+"'s plan";
    $("dayCount").textContent=`${dayCount(selectedDate).total} routine${dayCount(selectedDate).total===1?"":"s"}`;
  }
  function renderRoutines() {
    const rs=dayRoutines(selectedDate);
    $("emptyState").classList.toggle("hidden",rs.length>0);
    $("routineList").innerHTML=rs.map(r=>`<article class="routine-item ${completed(r.id,selectedDate)?"done":""}">
      <input class="routine-check" type="checkbox" data-check="${r.id}" ${completed(r.id,selectedDate)?"checked":""} aria-label="Mark ${escapeHtml(r.name)} complete">
      <div class="routine-main"><div class="routine-name">${escapeHtml(r.name)}</div><div class="routine-meta"><span class="category-pill">${escapeHtml(r.category)}</span>${r.time?`<span class="routine-time">◷ ${escapeHtml(r.time)}</span>`:""}<span class="routine-time">Repeats ${r.days.map(d=>DAYS[d]).join(", ")}</span></div></div>
      <div class="routine-actions"><button class="mini-btn" data-edit="${r.id}" title="Edit routine" aria-label="Edit routine">✎</button><button class="mini-btn" data-delete="${r.id}" title="Delete routine" aria-label="Delete routine">×</button></div>
    </article>`).join("");
  }
  function renderChart(a) {
    $("weeklyChart").innerHTML=a.days.map(d=>`<div class="chart-day"><div class="chart-track"><div class="chart-bar" style="height:${d.rate}%"></div></div><small>${DAYS[parseDay(d.key).getDay()]}</small></div>`).join("");
    $("weeklySummary").textContent=`${a.done} / ${a.total} complete`;
  }
  function renderAchievements() {
    $("achievementList").innerHTML=ACHIEVEMENTS.map(a=>{const unlocked=a.test(state);return `<div class="achievement ${unlocked?"":"locked"}"><div class="achievement-icon">${unlocked?a.icon:"🔒"}</div><div><strong>${a.name}</strong><small>${unlocked?"Unlocked":a.desc}</small></div></div>`;}).join("");
  }
  function renderHistory() {
    const key=$("historyDate").value||todayKey(), rs=dayRoutines(key), done=rs.filter(r=>completed(r.id,key)).length, missed=rs.length-done;
    $("historySummary").innerHTML=`<div class="history-stat"><strong>${done}</strong><span>Completed</span></div><div class="history-stat"><strong>${missed}</strong><span>Not completed</span></div><div class="history-stat"><strong>${rs.length?Math.round(done/rs.length*100):0}%</strong><span>Completion</span></div>`;
    $("historyList").innerHTML=rs.length?rs.map(r=>`<div class="history-row"><span>${escapeHtml(r.name)}</span><span class="history-status ${completed(r.id,key)?"status-done":"status-missed"}">${completed(r.id,key)?"✓ Complete":"○ Not complete"}</span></div>`).join(""):`<p class="muted">No routines were scheduled for ${dateLabel(key,{month:"short",day:"numeric",year:"numeric"})}.</p>`;
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function checkAchievements() { const fresh=ACHIEVEMENTS.filter(a=>a.test(state)); if(fresh.length) toast("Great work — keep building your streak!"); }

  function openRoutine(r=null) {
    $("routineForm").reset(); $("routineId").value=r?.id||""; $("routineDialogTitle").textContent=r?"Edit routine":"Add a routine";
    $("routineName").value=r?.name||""; $("routineCategory").value=r?.category||"Personal"; $("routineTime").value=r?.time||"";
    $("weekdayChecks").innerHTML=DAYS.map((d,i)=>`<label><input type="checkbox" value="${i}" ${r?(r.days.includes(i)?"checked":""):"checked"}>${d}</label>`).join("");
    $("routineDialog").showModal(); $("routineName").focus();
  }
  $("routineForm").addEventListener("submit",e=>{
    e.preventDefault(); const id=$("routineId").value, name=$("routineName").value.trim();
    const days=[...$("weekdayChecks").querySelectorAll("input:checked")].map(el=>Number(el.value));
    if(!name) return toast("Enter a routine name."); if(!days.length) return toast("Choose at least one day.");
    const existing=state.routines.find(r=>r.id===id);
    const routine={id:id||uid(),name,category:$("routineCategory").value,time:$("routineTime").value,days,createdAt:existing?.createdAt||new Date().toISOString()};
    if(existing) state.routines=state.routines.map(r=>r.id===id?routine:r); else state.routines.push(routine);
    persist(); $("routineDialog").close(); render(); toast(existing?"Routine updated":"Routine added");
  });
  $("routineList").addEventListener("change",e=>{const id=e.target.dataset.check;if(id)setCompleted(id,selectedDate,e.target.checked);});
  $("routineList").addEventListener("click",e=>{
    const edit=e.target.closest("[data-edit]")?.dataset.edit, del=e.target.closest("[data-delete]")?.dataset.delete;
    if(edit)openRoutine(state.routines.find(r=>r.id===edit));
    if(del && confirm("Delete this routine? Its saved completion history will remain in the backup, but the routine will no longer appear in history.")){
      state.routines=state.routines.filter(r=>r.id!==del); persist(); render(); toast("Routine deleted");
    }
  });
  $("weekStrip").addEventListener("click",e=>{const b=e.target.closest("[data-day]");if(b){selectedDate=b.dataset.day;render();}});
  $("addRoutineBtn").onclick=()=>openRoutine(); $("emptyAddBtn").onclick=()=>openRoutine();
  document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>$(b.dataset.close).close());
  $("historyDate").addEventListener("change",renderHistory);
  $("themeBtn").onclick=()=>{state.settings.theme=state.settings.theme==="dark"?"light":"dark";applyTheme();persist();};
  function applyTheme(){document.documentElement.dataset.theme=state.settings.theme||"light";$("themeBtn").textContent=state.settings.theme==="dark"?"☀":"☾";}
  $("exportBtn").onclick=()=>{
    const blob=new Blob([JSON.stringify({app:"Daymark",version:3,exportedAt:new Date().toISOString(),state},null,2)],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`daymark-backup-${todayKey()}.json`;a.click();URL.revokeObjectURL(a.href);toast("Backup exported");
  };
  $("importFile").addEventListener("change",async e=>{
    const file=e.target.files[0];if(!file)return;
    try {const data=JSON.parse(await file.text());const candidate=data.state||data;if(!candidate||!Array.isArray(candidate.routines)||!candidate.completions)throw new Error("This does not look like a Daymark backup.");
      if(!confirm("Import this backup? It will replace routines and history currently stored on this device."))return;
      state=normalizeState(candidate);persist();applyTheme();render();toast("Backup imported");
    }catch(err){alert(err.message||"Could not import this file.");}finally{e.target.value="";}
  });
  $("reminderBtn").onclick=async()=>{
    if(!("Notification" in window))return toast("This browser does not support notifications.");
    const result=await Notification.requestPermission();state.settings.notifications=result==="granted";persist({sync:false});
    $("reminderStatus").textContent=result==="granted"?"Notifications enabled. Keep this app open for reminders.":"Notification permission was not granted.";toast($("reminderStatus").textContent);
  };
  $("testReminderBtn").onclick=()=>{if(!("Notification"in window)||Notification.permission!=="granted")return toast("Enable notifications first.");new Notification("Daymark reminder",{body:"A small step today keeps your routine going."});};
  function reminderLoop(){
    if(!state.settings.notifications||!("Notification"in window)||Notification.permission!=="granted")return;
    const now=new Date(), time=`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    state.routines.filter(r=>r.time===time&&r.days.includes(now.getDay())&&!completed(r.id,todayKey())).forEach(r=>{
      const k=`daymark.reminded.${r.id}.${todayKey()}.${time}`;if(sessionStorage.getItem(k))return;
      new Notification("Routine reminder",{body:`Time for: ${r.name}`});sessionStorage.setItem(k,"1");
    });
  }
  setInterval(reminderLoop,30000);
  $("reminderStatus").textContent=state.settings.notifications?"Notifications enabled. Keep this app open for reminders.":"Reminders are not enabled.";

  // Optional account/cloud sync. Local-only mode continues to work if the server is not running.
  async function api(path,options={}) {
    const headers={"Content-Type":"application/json",...(options.headers||{})};if(token)headers.Authorization=`Bearer ${token}`;
    const res=await fetch(`${API_BASE}${path}`,{...options,headers});
    const data=await res.json().catch(()=>({message:"Unexpected server response"}));
    if(!res.ok)throw new Error(data.message||`Request failed (${res.status})`);return data;
  }
  function setAccountMessage(msg,isError=false){$("accountMessage").textContent=msg;$("accountMessage").style.color=isError?"var(--red)":"var(--green)";}
  function updateAccountUI(){
    const logged=Boolean(token);$("accountLoggedOut").classList.toggle("hidden",logged);$("accountLoggedIn").classList.toggle("hidden",!logged);
    $("accountTitle").textContent=logged?"Account connected":"Cloud sync";$("cloudStatus").innerHTML=logged?'<span class="status-dot"></span> Cloud account':'<span class="status-dot"></span> Local mode';
    if(logged){$("accountEmail").textContent=localStorage.getItem("daymark.accountEmail")||"Signed in";$("accountBtn").textContent="Account";}
    else $("accountBtn").textContent="Account / Sync";
  }
  $("accountBtn").onclick=()=>{setAccountMessage("");$("accountDialog").showModal();};
  $("showLogin").onclick=()=>setAuthMode("login");$("showRegister").onclick=()=>setAuthMode("register");
  function setAuthMode(mode){editingAuthMode=mode;$("showLogin").classList.toggle("active",mode==="login");$("showRegister").classList.toggle("active",mode==="register");$("authSubmit").textContent=mode==="login"?"Sign in & sync":"Create account";$("authPassword").autocomplete=mode==="login"?"current-password":"new-password";setAccountMessage("");}
  $("authForm").addEventListener("submit",async e=>{
    e.preventDefault();const email=$("authEmail").value.trim().toLowerCase(),password=$("authPassword").value;
    $("authSubmit").disabled=true;setAccountMessage("Connecting…");
    try{
      const data=await api(`/auth/${editingAuthMode}`,{method:"POST",body:JSON.stringify({email,password})});
      token=data.token;localStorage.setItem(TOKEN_KEY,token);localStorage.setItem("daymark.accountEmail",data.email||email);
      if(data.state&&confirm("A cloud backup exists. Replace this device's local data with the cloud copy? Choose Cancel to keep local data and upload it instead.")){state=normalizeState(data.state);persist({sync:false});applyTheme();render();}
      await syncNow();setAccountMessage("Signed in and synced.");render();toast("Cloud sync connected");
    }catch(err){setAccountMessage(err.message,true);}finally{$("authSubmit").disabled=false;}
  });
  function scheduleSync(){clearTimeout(syncTimer);syncTimer=setTimeout(()=>syncNow().catch(e=>{console.warn("Cloud sync failed",e);$("cloudStatus").classList.add("offline");$("cloudStatus").title="Cloud sync failed. Open Account / Sync and retry."; }),700);}
  async function syncNow(){
    if(!token)throw new Error("Sign in first.");
    await api("/state",{method:"PUT",body:JSON.stringify({state})});
    $("cloudStatus").classList.remove("offline");$("cloudStatus").title="Cloud sync is connected.";return true;
  }
  $("syncNowBtn").onclick=async()=>{try{await syncNow();setAccountMessage("Cloud copy updated.");toast("Synced successfully");}catch(e){setAccountMessage(e.message,true);}};
  $("signOutBtn").onclick=()=>{token="";localStorage.removeItem(TOKEN_KEY);localStorage.removeItem("daymark.accountEmail");updateAccountUI();setAccountMessage("Signed out. Local routines remain on this device.");toast("Signed out");};
  applyTheme(); render();
  if(token)api("/state").then(data=>{if(data.state){/* Keep local as source of truth until user explicitly chooses to sync. */}updateAccountUI();}).catch(()=>{$("cloudStatus").classList.add("offline");$("cloudStatus").title="Server not reachable; local mode still works.";});
})();