(function(){
  const includes = Array.from(document.querySelectorAll('[data-include]'));
  const fetches = includes.map(el => {
    const url = el.getAttribute('data-include');
    return fetch(url, {cache: 'no-cache'}).then(r => r.text()).then(html => {
      el.outerHTML = html;
    });
  });

  Promise.all(fetches).then(() => {
    const sidebar = document.getElementById('sidebar');
    const avatarBtn = document.getElementById('avatarBtn');
    const profileMenu = document.getElementById('profileMenu');

    function setSidebar(expanded){
      const cs = getComputedStyle(document.documentElement);
      const w = cs.getPropertyValue(expanded ? '--sidebar-expanded-w' : '--sidebar-collapsed-w').trim();
      document.documentElement.style.setProperty('--sidebar-w', w);
      if(sidebar) sidebar.classList.toggle('expanded', !!expanded);
    }

    // initial collapsed
    setSidebar(false);

    if(sidebar){
      sidebar.addEventListener('mouseenter', ()=> setSidebar(true));
      sidebar.addEventListener('mouseleave', ()=> setSidebar(false));
    }

    if(avatarBtn && profileMenu){
      avatarBtn.addEventListener('click', (e)=>{
        e.stopPropagation();
        profileMenu.style.display = profileMenu.style.display === 'block' ? 'none' : 'block';
      });
      document.addEventListener('click', ()=> profileMenu.style.display = 'none');
    }

    // --- Active Tab dynamisch füllen ---
    const path = window.location.pathname;
    const activeHead = document.getElementById('activeHead');
    const activeSubnav = document.getElementById('activeSubnav');

    function setActiveTab(icon, title, subs){
      if(activeHead){
        activeHead.innerHTML = `<i data-lucide="${icon}"></i>
          <div class="label" style="font-weight:600; color:var(--title)">${title}</div>`;
      }
      if(activeSubnav){
        activeSubnav.innerHTML = "";
        if(subs && subs.length){
          subs.forEach(s=>{
            const btn = document.createElement("button");
            btn.className = "nav-btn";
            btn.style.height = "36px";
            btn.dataset.target = s.href;
            btn.innerHTML = `<span class="txt-glow">${s.label}</span>`;
            btn.addEventListener("click", ()=> window.location.href = s.href);
            activeSubnav.appendChild(btn);
          });
        }
      }
      if(window.lucide) window.lucide.createIcons();
    }

    if(path.includes('/players/')){
      setActiveTab("users", "Players", [
        {label:"Analysis", href:"/pages/players/analysis/index.html"},
        {label:"Compare", href:"/pages/players/compare/index.html"},
        {label:"Profile", href:"/pages/players/profile/index.html"}
      ]);
    } else if(path.includes('/guilds/')){
      setActiveTab("shield", "Guilds", [
        {label:"Planner", href:"/pages/guilds/planner/index.html"},
        {label:"Fusion", href:"/pages/guilds/fusion/index.html"},
        {label:"Academy", href:"/pages/guilds/academy/index.html"}
      ]);
    } else if(path.includes('/community/')){
      setActiveTab("message-square-text", "Community", [
        {label:"Scans", href:"/pages/community/scans/index.html"},
        {label:"Predictions", href:"/pages/community/predictions/index.html"},
        {label:"Creator Hub", href:"/pages/community/creatorhub/index.html"}
      ]);
    } else if(path.includes('/toplists/')){
      setActiveTab("list-ordered", "Toplists", [
        {label:"Toplists", href:"/pages/toplists/index.html"}
      ]);
    } else if(path.includes('/settings/')){
      setActiveTab("settings", "Settings", [
        {label:"Settings", href:"/pages/settings/index.html"}
      ]);
    } else if(path.includes('/account/')){
      setActiveTab("user", "Account", [
        {label:"Auth", href:"/pages/account/auth/index.html"}
      ]);
    } else {
      // Home oder Dashboard → keine Subnav
      setActiveTab("home", "Home", []);
    }

    // Footer dynamic year + version/build
    const legal = document.getElementById('legalText');
    if(legal){
      const year = new Date().getFullYear();
      legal.textContent = `© ${year} SFDataHub — Alle Marken- und Bildrechte liegen bei den jeweiligen Inhabern.`;
    }
    const ver = document.querySelector('meta[name="sf-version"]')?.getAttribute('content') || '0.1.0';
    const build = document.querySelector('meta[name="sf-build"]')?.getAttribute('content') || (new Date()).toISOString().slice(0,10);
    const vb = document.getElementById('verBuild');
    if(vb) vb.textContent = `v${ver} • Build ${build}`;

    // Init lucide icons
    if(window.lucide){ window.lucide.createIcons(); }
  }).catch(err => {
    console.error('Partial include failed:', err);
  });
})();
