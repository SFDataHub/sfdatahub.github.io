function detectLanguage() {
  const langs = navigator.languages || [navigator.language || "en"];
  const primary = langs[0].split("-")[0].toLowerCase();
  const supported = ["en", "de"];
  return supported.includes(primary) ? primary : "en";
}

async function loadLanguage(lang){
  try{
    const res=await fetch('/assets/i18n/'+lang+'.json');
    const dict=await res.json();
    document.querySelectorAll('[data-i18n]').forEach(el=>{
      const k=el.getAttribute('data-i18n');
      if(dict[k]!==undefined){
        if(el.tagName==='INPUT' || el.tagName==='TEXTAREA'){
          el.placeholder=dict[k];
        }else if(el.tagName==='BUTTON'){
          el.textContent=dict[k];
        }else{
          el.textContent=dict[k];
        }
      }
    });
    if(dict.title) document.title=dict.title;
    localStorage.setItem('lang',lang);
    document.documentElement.setAttribute('lang',lang);
  }catch(e){ console.error('i18n load error', e); }
}

function initI18n(){
  let lang = localStorage.getItem('lang');
  if(!lang) {
    lang = detectLanguage();
    localStorage.setItem('lang', lang);
  }
  loadLanguage(lang);
  document.addEventListener('click',(e)=>{
    const btn=e.target.closest('[data-lang]');
    if(!btn) return;
    const newLang = btn.getAttribute('data-lang');
    if(newLang){
      loadLanguage(newLang);
      localStorage.setItem('lang', newLang);
    }
  });
}
document.addEventListener('DOMContentLoaded',initI18n);
