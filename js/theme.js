// الإضاءة: الغامق (ألوان السيستم) هو الأساسي، والفاتح لو المستخدم اختاره من القايمة.
// الاختيار بيتحفظ على الجهاز. الملف ده بيتحمّل في أول الصفحة عشان الألوان ماترمش وهي بتفتح.
(function () {
  var theme = "dark";
  try {
    if (localStorage.getItem("theme") === "light") theme = "light";
  } catch (error) {
    // التخزين مش متاح: يفضل الغامق
  }
  document.documentElement.setAttribute("data-bs-theme", theme);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#131B2B" : "#0d6efd");
})();
