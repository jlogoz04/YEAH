document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('select[data-target]').forEach(sel => {
    sel.addEventListener('change', () => {
      const r = sel.value;
      const target = sel.getAttribute('data-target');
      const url = new URL(window.location.origin + target);
      url.searchParams.set('round', r);
      window.location.href = url.toString();
    });
  });

  const jump = document.getElementById('roundJump');
  if (jump) {
    jump.addEventListener('change', () => {
      const r = jump.value;
      const el = document.getElementById('round-' + r);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const url = new URL(window.location.href);
      url.searchParams.set('round', r);
      history.replaceState(null,'',url.toString());
    });
  }
});