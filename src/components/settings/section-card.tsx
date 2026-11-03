type SectionCardProps = {
  children: React.ReactNode;
};

export function SectionCard({ children }: SectionCardProps) {
  return (
    <section className="rounded-[2rem] border border-accent-100 bg-white p-5 shadow-[0_20px_60px_rgba(22,80,155,0.07)] sm:p-6">
      {children}
    </section>
  );
}
