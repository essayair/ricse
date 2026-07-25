export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-muted">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4 text-foreground">RICSE</h1>
        <p className="text-lg text-muted-foreground mb-8">
          运营管理平台
        </p>
        <div className="flex gap-4 justify-center">
          <a
            href="/api/docs"
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            target="_blank"
          >
            API 文档
          </a>
          <a
            href="/login"
            className="px-6 py-3 border border-input bg-background text-foreground rounded-lg hover:bg-accent transition-colors"
          >
            登录
          </a>
        </div>
      </div>
    </main>
  );
}
