<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('✅ Service Worker registered:', reg))
      .catch(err => console.warn('❌ Service Worker failed:', err));
  }
</script>
