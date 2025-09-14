
// Boot logic with sidebar + i18n init
document.addEventListener('DOMContentLoaded',()=>{
  if(window.w3 && typeof w3.includeHTML==='function'){
    w3.includeHTML(()=>{
      if(typeof initI18n==='function') initI18n();
      const sidebar = document.querySelector('[data-sidebar]');
      if (sidebar) {
        const norm = p => p.replace(/\/index\.html$/, '').replace(/\/+$/, '');
        const current = norm(location.pathname);
        let activeSection = null;
        sidebar.querySelectorAll('a[href]').forEach(a => {
          const href = norm(new URL(a.getAttribute('href'), location.href).pathname);
          const isActive = href === current || (current === '' && href === '');
          a.classList.toggle('active', isActive);
          if (isActive) {
            a.setAttribute('aria-current','page');
            if (a.dataset.section) activeSection = a.dataset.section;
          } else {
            a.removeAttribute('aria-current');
          }
        });
        sidebar.querySelectorAll('[data-subnav]').forEach(el => {
          el.hidden = (el.dataset.subnav !== activeSection);
        });
      }
    });
  }else{
    if(typeof initI18n==='function') initI18n();
  }
});
