import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { 
  Play, 
  Pause, 
  Square, 
  Download, 
  RefreshCw, 
  Settings,
  Activity,
  Database,
  FileJson,
  AlertCircle,
  CheckCircle,
  Info,
  AlertTriangle,
  Building2,
  Stethoscope,
  Clock,
  Loader2
} from "lucide-react";
import type { ScraperStatus, ScraperResults, ScraperConfig, Hospital, Doctor } from "@shared/schema";

type LogEntry = {
  timestamp: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
};

function StatusBadge({ status }: { status: ScraperStatus["status"] }) {
  const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
    idle: { variant: "secondary", className: "bg-muted text-muted-foreground" },
    running: { variant: "default", className: "bg-chart-1 text-white animate-pulse" },
    paused: { variant: "outline", className: "border-chart-4 text-chart-4" },
    completed: { variant: "default", className: "bg-status-online text-white" },
    error: { variant: "destructive", className: "" },
  };

  const config = variants[status] || variants.idle;

  return (
    <Badge variant={config.variant} className={config.className} data-testid="badge-scraper-status">
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function LogIcon({ level }: { level: LogEntry["level"] }) {
  switch (level) {
    case "success":
      return <CheckCircle className="h-4 w-4 text-status-online flex-shrink-0" />;
    case "error":
      return <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />;
    case "warn":
      return <AlertTriangle className="h-4 w-4 text-status-away flex-shrink-0" />;
    default:
      return <Info className="h-4 w-4 text-chart-1 flex-shrink-0" />;
  }
}

function ProgressMetrics({ status }: { status: ScraperStatus }) {
  const progress = status.totalHospitals > 0 
    ? Math.round((status.hospitalsProcessed / status.totalHospitals) * 100) 
    : 0;

  return (
    <Card data-testid="card-progress-metrics">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5 text-chart-1" />
          Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Overall Progress</span>
            <span className="font-medium" data-testid="text-progress-percent">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" data-testid="progress-bar" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1 p-3 rounded-md bg-muted/50">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="h-4 w-4" />
              <span className="text-xs">Hospitals</span>
            </div>
            <p className="text-2xl font-bold" data-testid="text-hospitals-count">
              {status.hospitalsProcessed}
              <span className="text-sm font-normal text-muted-foreground">/{status.totalHospitals || "?"}</span>
            </p>
          </div>
          <div className="space-y-1 p-3 rounded-md bg-muted/50">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Stethoscope className="h-4 w-4" />
              <span className="text-xs">Doctors</span>
            </div>
            <p className="text-2xl font-bold" data-testid="text-doctors-count">{status.doctorsScraped}</p>
          </div>
        </div>

        {status.currentHospital && (
          <div className="p-3 rounded-md bg-chart-1/10 border border-chart-1/20">
            <p className="text-xs text-muted-foreground mb-1">Currently Processing</p>
            <p className="text-sm font-medium truncate" data-testid="text-current-hospital">{status.currentHospital}</p>
            {status.currentDoctor && (
              <p className="text-xs text-muted-foreground truncate mt-1" data-testid="text-current-doctor">
                Doctor: {status.currentDoctor}
              </p>
            )}
          </div>
        )}

        {status.startedAt && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Started: {new Date(status.startedAt).toLocaleTimeString()}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LiveLogs({ logs }: { logs: LogEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <Card className="flex flex-col h-full" data-testid="card-live-logs">
      <CardHeader className="pb-3 flex-shrink-0">
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5 text-chart-2" />
          Live Activity
        </CardTitle>
        <CardDescription>Real-time scraping logs</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 min-h-0">
        <ScrollArea className="h-[400px] pr-4" ref={scrollRef}>
          <div className="space-y-2">
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8" data-testid="text-no-logs">
                No logs yet. Start the scraper to see activity.
              </p>
            ) : (
              logs.map((log, index) => (
                <div 
                  key={index} 
                  className="flex items-start gap-2 text-sm py-1.5 border-b border-border/50 last:border-0"
                  data-testid={`log-entry-${index}`}
                >
                  <LogIcon level={log.level} />
                  <div className="flex-1 min-w-0">
                    <p className="break-words">{log.message}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function DataPreview({ results }: { results: ScraperResults | null }) {
  const [expandedHospital, setExpandedHospital] = useState<number | null>(null);

  if (!results || results.hospitals.length === 0) {
    return (
      <Card data-testid="card-data-preview">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Database className="h-5 w-5 text-chart-3" />
            Data Preview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            <FileJson className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p data-testid="text-no-data">No data scraped yet</p>
            <p className="text-sm mt-1">Start the scraper to collect hospital and doctor data</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-data-preview">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Database className="h-5 w-5 text-chart-3" />
          Data Preview
        </CardTitle>
        <CardDescription>
          {results.metadata.totalHospitals} hospitals, {results.metadata.totalDoctors} doctors
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          <div className="space-y-3">
            {results.hospitals.map((hospital, index) => (
              <div 
                key={index} 
                className="border rounded-md overflow-hidden"
                data-testid={`hospital-preview-${index}`}
              >
                <button
                  className="w-full p-3 text-left hover-elevate flex items-center justify-between"
                  onClick={() => setExpandedHospital(expandedHospital === index ? null : index)}
                  data-testid={`button-expand-hospital-${index}`}
                >
                  <div>
                    <p className="font-medium">{hospital.hospitalName}</p>
                    <p className="text-sm text-muted-foreground">{hospital.hospitalAddress}</p>
                  </div>
                  <Badge variant="secondary">{hospital.doctors.length} doctors</Badge>
                </button>
                {expandedHospital === index && (
                  <div className="border-t bg-muted/30 p-3 space-y-2">
                    {hospital.doctors.slice(0, 5).map((doctor, dIndex) => (
                      <div key={dIndex} className="text-sm p-2 bg-background rounded" data-testid={`doctor-preview-${index}-${dIndex}`}>
                        <p className="font-medium">{doctor.name}</p>
                        <p className="text-muted-foreground">{doctor.specialty} - {doctor.qualification}</p>
                        <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                          <span>Exp: {doctor.experience}</span>
                          <span>Fee: {doctor.fees}</span>
                          <span>Reviews: {doctor.reviews}</span>
                        </div>
                        {doctor.otherHospitals.length > 0 && (
                          <p className="text-xs mt-1 text-chart-1">
                            Also at: {doctor.otherHospitals.map(h => h.name).join(", ")}
                          </p>
                        )}
                      </div>
                    ))}
                    {hospital.doctors.length > 5 && (
                      <p className="text-xs text-muted-foreground text-center py-1">
                        +{hospital.doctors.length - 5} more doctors
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function ScraperControls({ 
  status, 
  onStart, 
  onPause, 
  onStop, 
  onExport,
  isStarting,
  isExporting
}: { 
  status: ScraperStatus;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  onExport: () => void;
  isStarting: boolean;
  isExporting: boolean;
}) {
  const isRunning = status.status === "running";
  const isPaused = status.status === "paused";
  const hasData = status.doctorsScraped > 0;

  return (
    <Card data-testid="card-scraper-controls">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg">Marham.pk Scraper</CardTitle>
            <CardDescription>Extract hospital and doctor data</CardDescription>
          </div>
          <StatusBadge status={status.status} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {!isRunning && !isPaused && (
            <Button 
              onClick={onStart} 
              disabled={isStarting}
              data-testid="button-start-scraper"
            >
              {isStarting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Start Scraping
            </Button>
          )}
          {isRunning && (
            <Button variant="secondary" onClick={onPause} data-testid="button-pause-scraper">
              <Pause className="h-4 w-4 mr-2" />
              Pause
            </Button>
          )}
          {isPaused && (
            <Button onClick={onStart} disabled={isStarting} data-testid="button-resume-scraper">
              <Play className="h-4 w-4 mr-2" />
              Resume
            </Button>
          )}
          {(isRunning || isPaused) && (
            <Button variant="destructive" onClick={onStop} data-testid="button-stop-scraper">
              <Square className="h-4 w-4 mr-2" />
              Stop
            </Button>
          )}
          <Button 
            variant="outline" 
            onClick={onExport} 
            disabled={!hasData || isExporting}
            data-testid="button-export-data"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Export JSON
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfigurationPanel({ 
  config, 
  onConfigChange,
  disabled 
}: { 
  config: Partial<ScraperConfig>;
  onConfigChange: (config: Partial<ScraperConfig>) => void;
  disabled: boolean;
}) {
  return (
    <Card data-testid="card-configuration">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Settings className="h-5 w-5 text-chart-4" />
          Configuration
        </CardTitle>
        <CardDescription>Customize scraping parameters</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="startUrl">Start URL</Label>
          <Input
            id="startUrl"
            value={config.startUrl || "https://www.marham.pk/hospitals/karachi"}
            onChange={(e) => onConfigChange({ ...config, startUrl: e.target.value })}
            disabled={disabled}
            placeholder="https://www.marham.pk/hospitals/karachi"
            data-testid="input-start-url"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="maxHospitals">Max Hospitals</Label>
            <Input
              id="maxHospitals"
              type="number"
              value={config.maxHospitals || ""}
              onChange={(e) => onConfigChange({ ...config, maxHospitals: e.target.value ? parseInt(e.target.value) : undefined })}
              disabled={disabled}
              placeholder="All"
              data-testid="input-max-hospitals"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxDoctors">Max Doctors/Hospital</Label>
            <Input
              id="maxDoctors"
              type="number"
              value={config.maxDoctorsPerHospital || ""}
              onChange={(e) => onConfigChange({ ...config, maxDoctorsPerHospital: e.target.value ? parseInt(e.target.value) : undefined })}
              disabled={disabled}
              placeholder="All"
              data-testid="input-max-doctors"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="delay">Delay Between Requests (ms)</Label>
          <Input
            id="delay"
            type="number"
            value={config.delayBetweenRequests || 2000}
            onChange={(e) => onConfigChange({ ...config, delayBetweenRequests: parseInt(e.target.value) || 2000 })}
            disabled={disabled}
            data-testid="input-delay"
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { toast } = useToast();
  const [config, setConfig] = useState<Partial<ScraperConfig>>({
    startUrl: "https://www.marham.pk/hospitals/karachi",
    delayBetweenRequests: 2000,
  });

  const { data: status, refetch: refetchStatus } = useQuery<ScraperStatus>({
    queryKey: ["/api/scraper/status"],
    refetchInterval: 1000,
  });

  const { data: results, refetch: refetchResults } = useQuery<ScraperResults>({
    queryKey: ["/api/scraper/results"],
    refetchInterval: 5000,
  });

  const startMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/scraper/start", config),
    onSuccess: () => {
      toast({ title: "Scraper started", description: "Scraping process has begun" });
      queryClient.invalidateQueries({ queryKey: ["/api/scraper/status"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to start", description: error.message, variant: "destructive" });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/scraper/pause"),
    onSuccess: () => {
      toast({ title: "Scraper paused" });
      queryClient.invalidateQueries({ queryKey: ["/api/scraper/status"] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/scraper/stop"),
    onSuccess: () => {
      toast({ title: "Scraper stopped" });
      queryClient.invalidateQueries({ queryKey: ["/api/scraper/status"] });
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/scraper/export");
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `marham-data-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      toast({ title: "Export complete", description: "Data has been downloaded" });
    },
    onError: (error: Error) => {
      toast({ title: "Export failed", description: error.message, variant: "destructive" });
    },
  });

  const currentStatus: ScraperStatus = status || {
    status: "idle",
    hospitalsProcessed: 0,
    totalHospitals: 0,
    doctorsScraped: 0,
    errors: [],
    logs: [],
  };

  const isRunning = currentStatus.status === "running" || currentStatus.status === "paused";

  return (
    <div className="min-h-screen bg-background" data-testid="page-dashboard">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-md bg-chart-1 flex items-center justify-center">
                <Stethoscope className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Marham.pk Scraper</h1>
                <p className="text-sm text-muted-foreground">Hospital & Doctor Data Extraction</p>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => { refetchStatus(); refetchResults(); }}
              data-testid="button-refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1 space-y-6">
            <ScraperControls
              status={currentStatus}
              onStart={() => startMutation.mutate()}
              onPause={() => pauseMutation.mutate()}
              onStop={() => stopMutation.mutate()}
              onExport={() => exportMutation.mutate()}
              isStarting={startMutation.isPending}
              isExporting={exportMutation.isPending}
            />
            <ProgressMetrics status={currentStatus} />
            <ConfigurationPanel 
              config={config} 
              onConfigChange={setConfig}
              disabled={isRunning}
            />
          </div>

          <div className="lg:col-span-2">
            <Tabs defaultValue="logs" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="logs" data-testid="tab-logs">
                  <Activity className="h-4 w-4 mr-2" />
                  Live Logs
                </TabsTrigger>
                <TabsTrigger value="data" data-testid="tab-data">
                  <Database className="h-4 w-4 mr-2" />
                  Data Preview
                </TabsTrigger>
              </TabsList>
              <TabsContent value="logs">
                <LiveLogs logs={currentStatus.logs} />
              </TabsContent>
              <TabsContent value="data">
                <DataPreview results={results || null} />
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {currentStatus.errors.length > 0 && (
          <Card className="mt-6 border-destructive/50" data-testid="card-errors">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                Errors ({currentStatus.errors.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[200px]">
                <div className="space-y-2">
                  {currentStatus.errors.map((error, index) => (
                    <div key={index} className="text-sm p-2 rounded bg-destructive/10" data-testid={`error-entry-${index}`}>
                      <p className="font-medium">{error.message}</p>
                      {error.context && <p className="text-muted-foreground mt-1">{error.context}</p>}
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(error.timestamp).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
