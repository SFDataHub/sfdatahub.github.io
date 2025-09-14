document.addEventListener('DOMContentLoaded',()=>{
 if(window.w3&&w3.includeHTML){w3.includeHTML(()=>{
   if(window.lucide&&lucide.createIcons){try{lucide.createIcons();}catch(e){}}
   if(typeof initI18n==='function') initI18n();
   const btn=document.getElementById('avatarBtn'), menu=document.getElementById('profileMenu');
   if(btn&&menu){btn.addEventListener('click',()=>{menu.style.display=(menu.style.display==='block')?'none':'block'});
     document.addEventListener('click',(e)=>{if(!menu.contains(e.target)&&!btn.contains(e.target)) menu.style.display='none';});
     const wrap=document.createElement('div');wrap.style.marginTop='12px';wrap.innerHTML='<div style="font-size:12px;color:var(--text-soft);margin-bottom:6px">Language</div><div style="display:flex;gap:8px"><img data-lang="en" src="/assets/img/icons/flag-en.png" style="width:28px;height:20px;border:1px solid var(--line);border-radius:4px;cursor:pointer"><img data-lang="de" src="/assets/img/icons/flag-de.png" style="width:28px;height:20px;border:1px solid var(--line);border-radius:4px;cursor:pointer"></div>'; menu.firstElementChild.appendChild(wrap); }
   const sb=document.getElementById('sidebar'); if(sb){ const path=location.pathname.replace(/\/index\.html$/,'').replace(/\/$/,'/');
     const map=[
       {re:/^\/$/,icon:'home',label:'Home',items:['Spieler','Server','Klassen']},
       {re:/^\/pages\/dashboard\//,icon:'bar-chart-3',label:'Dashboard',items:['Overview','Widgets','Reports']},
       {re:/^\/pages\/players\//,icon:'users',label:'Players',items:['Analysis','Compare','Profile']},
       {re:/^\/pages\/guilds\//,icon:'shield',label:'Guilds',items:['Planner','Fusion','Academy']},
       {re:/^\/pages\/community\//,icon:'message-square-text',label:'Community',items:['Scans','Predictions','Creator Hub']},
       {re:/^\/pages\/toplists\//,icon:'list-ordered',label:'Toplisten',items:['Global','EU','NA']},
       {re:/^\/pages\/settings\//,icon:'settings',label:'Settings',items:['Account','Privacy','About']},
       {re:/^\/pages\/account\//,icon:'user',label:'Account',items:['Auth','Security','Billing']}
     ]; const m=map.find(m=>m.re.test(path))||map[0];
     const head=sb.querySelector('.active-head'); if(head){ const i=head.querySelector('i[data-lucide]'); if(i) i.setAttribute('data-lucide', m.icon); const lab=head.querySelector('.label'); if(lab) lab.textContent=m.label; }
     const sub=sb.querySelector('.active-block .subcol'); if(sub){ sub.innerHTML=''; m.items.forEach(t=>{const b=document.createElement('button'); b.className='nav-btn'; b.style.height='36px'; b.innerHTML='<span class="txt-glow">'+t+'</span>'; sub.appendChild(b); }); }
     if(window.lucide&&lucide.createIcons){try{lucide.createIcons();}catch(e){}}
   }
 });}});