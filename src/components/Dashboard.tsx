import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  CalendarDays,
  ImagePlus,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  User,
  Link2,
  BarChart3
} from 'lucide-react';
import { Overview } from './dashboard/Overview';
import { Calendar } from './dashboard/Calendar';
import { MediaLibrary } from './dashboard/MediaLibrary';
import { PostComposer } from './dashboard/PostComposer';
import { ConnectedAccounts } from './dashboard/ConnectedAccounts';
import { Analytics } from './dashboard/Analytics';

type View = 'overview' | 'calendar' | 'media' | 'compose' | 'accounts' | 'analytics';

export function Dashboard() {
  const { signOut, user } = useAuth();
  const [currentView, setCurrentView] = useState<View>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navigation = [
    { id: 'overview', name: 'Tableau de bord', icon: LayoutDashboard },
    { id: 'compose', name: 'Créer', icon: FileText },
    { id: 'calendar', name: 'Calendrier', icon: CalendarDays },
    { id: 'media', name: 'Médias', icon: ImagePlus },
    { id: 'analytics', name: 'Analytics', icon: BarChart3 },
    { id: 'accounts', name: 'Comptes liés', icon: Link2 },
  ];

  const renderView = () => {
    switch (currentView) {
      case 'overview':
        return <Overview />;
      case 'calendar':
        return <Calendar />;
      case 'media':
        return <MediaLibrary />;
      case 'compose':
        return <PostComposer />;
      case 'accounts':
        return <ConnectedAccounts />;
      case 'analytics':
        return <Analytics />;
      default:
        return <Overview />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b border-slate-200 z-50 px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
          ContentFlow
        </h1>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 hover:bg-slate-100 rounded-lg transition"
        >
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      <div className="flex pt-16 lg:pt-0">
        <aside
          className={`${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } lg:translate-x-0 fixed lg:static inset-y-0 left-0 w-64 bg-white border-r border-slate-200 transition-transform duration-300 z-40 flex flex-col`}
        >
          <div className="p-6 border-b border-slate-200 hidden lg:block">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              ContentFlow
            </h1>
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentView(item.id as View);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                    isActive
                      ? 'bg-blue-50 text-blue-600 font-medium'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.name}</span>
                </button>
              );
            })}
          </nav>

          <div className="p-4 border-t border-slate-200 space-y-2">
            <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-lg">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white font-semibold">
                {user?.email?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{user?.email}</p>
                <p className="text-xs text-slate-500">Compte premium</p>
              </div>
            </div>

            <button
              onClick={() => signOut()}
              className="w-full flex items-center gap-3 px-4 py-3 text-slate-700 hover:bg-slate-50 rounded-lg transition"
            >
              <LogOut className="w-5 h-5" />
              <span>Déconnexion</span>
            </button>
          </div>
        </aside>

        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto p-6 lg:p-8">
            {renderView()}
          </div>
        </main>
      </div>
    </div>
  );
}
