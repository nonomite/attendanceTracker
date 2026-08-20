document.getElementById("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("adminEmail").value.trim();
  const password = document.getElementById("adminPassword").value;
  const loginBtn = document.getElementById("loginBtn");
  const loginError = document.getElementById("loginError");

  loginError.hidden = true;
  loginBtn.disabled = true;
  loginBtn.textContent = "Signing in...";

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    loginError.textContent = "Invalid admin email or password. Please try again.";
    loginError.hidden = false;
    loginBtn.disabled = false;
    loginBtn.textContent = "Login";
    return;
  }

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("role")
    .eq("id", data.session.user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    await supabaseClient.auth.signOut();
    loginError.textContent = "This account isn't authorized as an admin.";
    loginError.hidden = false;
    loginBtn.disabled = false;
    loginBtn.textContent = "Login";
    return;
  }

  window.location.href = "index.html";
});
