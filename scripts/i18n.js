
async function loadLanguage(lang){
  const res=await fetch('/assets/i18n/'+lang+'.json');
  const dict=await res.json();
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const k=el.getAttribute('data-i18n');
    if(dict[k]) el.textContent=dict[k];
  });
  if(dict.title) document.title=dict.title;
  localStorage.setItem('lang',lang);
}
function initI18n(){
  const l=localStorage.getItem('lang')||'en';
  loadLanguage(l);
  document.querySelectorAll('[data-lang]').forEach(btn=>{
    btn.addEventListener('click',()=>loadLanguage(btn.getAttribute('data-lang')));
  });
}
document.addEventListener('DOMContentLoaded',initI18n);
