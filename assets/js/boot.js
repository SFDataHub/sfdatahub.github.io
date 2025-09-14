(function(){
  const includes = Array.from(document.querySelectorAll('[data-include]'));
  const fetches = includes.map(el => {
    const url = window.location.origin + '/' + el.getAttribute('data-include');
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

    // Language flags in profileMenu
    const menuBox = profileMenu?.querySelector("div[style*='position:absolute']");
    if(menuBox){
      const langBox = document.createElement('div');
      langBox.style.marginTop = "12px";
      langBox.style.display = "flex";
      langBox.style.gap = "8px";
      langBox.innerHTML = `
        <img src="https://flagcdn.com/w20/gb.png" alt="English" title="English" data-lang="en" style="cursor:pointer; border-radius:3px; border:1px solid var(--line)">
        <img src="https://flagcdn.com/w20/de.png" alt="Deutsch" title="Deutsch" data-lang="de" style="cursor:pointer; border-radius:3px; border:1px solid var(--line)">
      `;
      menuBox.appendChild(langBox);

      langBox.querySelectorAll('img').forEach(img=>{
        img.addEventListener('click', ()=>{
          if(window.setLanguage){
            window.setLanguage(img.dataset.lang);
          }
        });
      });
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

    // Active section handling
    const path = window.location.pathname;
    function showSubnav(section){
      document.querySelectorAll('.subcol').forEach(el=>{
        el.style.display = (el.dataset.section === section) ? "flex" : "none";
      });
    }

    if(path.includes('/players/')){
      showSubnav('players');
    } else if(path.includes('/guilds/')){
      showSubnav('guilds');
    } else if(path.includes('/community/')){
      showSubnav('community');
    } else if(path.includes('/toplists/')){
      showSubnav('toplists');
    } else if(path.includes('/settings/')){
      showSubnav('settings');
    } else if(path.includes('/account/')){
      showSubnav('account');
    } else if(path.includes('/dashboard/')){
      showSubnav(null); // Dashboard has no subs
    } else {
      showSubnav(null); // Home
    }

    // Init lucide icons
    if(window.lucide){ window.lucide.createIcons(); }
  }).catch(err => {
    console.error('Partial include failed:', err);
  });
})();
