// Simple i18n handler
(function(){
  const defaultLang = 'en';
  const supported = ['en','de'];

  function getBrowserLang(){
    const lang = navigator.language.slice(0,2).toLowerCase();
    return supported.includes(lang) ? lang : defaultLang;
  }

  window.setLanguage = function(lang){
    if(!supported.includes(lang)) lang = defaultLang;
    localStorage.setItem('lang', lang);
    applyLanguage(lang);
  };

  function applyLanguage(lang){
    fetch(`/assets/i18n/${lang}.json`)
      .then(r=>r.json())
      .then(dict=>{
        document.querySelectorAll('[data-i18n]').forEach(el=>{
          const key = el.getAttribute('data-i18n');
          if(dict[key]) el.textContent = dict[key];
        });
      });
  }

  const saved = localStorage.getItem('lang') || getBrowserLang();
  applyLanguage(saved);
})();
