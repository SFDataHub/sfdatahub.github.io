(function(){
  const includes = Array.from(document.querySelectorAll('[data-include]'));
  const fetches = includes.map(el => {
    const url = el.getAttribute('data-include');
    return fetch(url, {cache: 'no-cache'}).then(r => r.text()).then(html => {
      el.outerHTML = html;
    });
  });

  Promise.all(fetches).then(() => {
    // After injecting, initialize behaviour
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
