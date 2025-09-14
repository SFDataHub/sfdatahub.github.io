// Navigation handler for sidebar buttons
document.addEventListener('DOMContentLoaded', ()=>{
  document.querySelectorAll('.nav-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const target = btn.dataset.target;
      if(target){
        window.location.href = target;
      }
    });
  });
});
