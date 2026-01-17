// Theme toggle logic
const themeToggle = document.getElementById('theme-toggle');
const savedTheme = localStorage.getItem('bloxd-theme') || 'light'; // Default to light

// Disable transition during initial load for instant theme application
document.body.style.transition = 'none';

if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
    themeToggle.textContent = '☀️';
} else {
    document.body.classList.remove('light-theme');
    themeToggle.textContent = '🌙';
}

// Re-enable transitions after a short delay
requestAnimationFrame(() => {
    requestAnimationFrame(() => {
        document.body.style.transition = '';
    });
});

themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    themeToggle.textContent = isLight ? '☀️' : '🌙';
    localStorage.setItem('bloxd-theme', isLight ? 'light' : 'dark');
});
