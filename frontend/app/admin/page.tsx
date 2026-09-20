import AdminPanel from "./AdminPanel"; 


export const metadata = {
  title: "Admin Portal | Goregaonmeds",
};

export default function AdminPage() {
  return (
    // Tailwind classes will perfectly work here!
    <main>
      <AdminPanel />
    </main>
  );
}