// Navigation handler for all buttons with data-target
document.addEventListener('DOMContentLoaded', ()=>{
  document.querySelectorAll('.nav-btn, .btn.login').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const target = btn.dataset.target;
      if(target){
        window.location.href = target;
      }
    });
  });
});
