import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

type Props = { children: ReactNode };
type State = { hasError: boolean; error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = import.meta.env.BASE_URL || "/";
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-display font-bold text-foreground">
              Algo deu errado
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Ocorreu um erro inesperado. Tente recarregar a página ou voltar ao
              início.
            </p>
          </div>

          {this.state.error && (
            <pre className="text-left text-xs text-muted-foreground bg-muted/50 rounded-xl p-4 overflow-auto max-h-32 border border-border">
              {this.state.error.message}
            </pre>
          )}

          <div className="flex gap-3 justify-center">
            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <RotateCcw className="w-4 h-4" />
              Recarregar
            </button>
            <button
              onClick={this.handleGoHome}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors border border-border"
            >
              <Home className="w-4 h-4" />
              Início
            </button>
          </div>
        </div>
      </div>
    );
  }
}
