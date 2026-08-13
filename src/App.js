import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function App() {
  const [activeTab, setActiveTab] = useState('student');
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState('');
  const [tripData, setTripData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Authentication State
  const [session, setSession] = useState(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [targetTabAfterLogin, setTargetTabAfterLogin] = useState('');

  // Check auth session on load
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch routes on load
  useEffect(() => {
    fetchRoutes();
  }, []);

  const fetchRoutes = async () => {
    const { data, error } = await supabase.from('routes').select('*');
    if (!error && data) {
      setRoutes(data);
      if (data.length > 0 && !selectedRoute) {
        setSelectedRoute(data[0].id);
      }
    }
  };

  // Subscribe to trip updates
  useEffect(() => {
    if (!selectedRoute) return;

    fetchTripStatus(selectedRoute);

    const channel = supabase
      .channel(`trip-${selectedRoute}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trips',
          filter: `route_id=eq.${selectedRoute}`,
        },
        (payload) => {
          setTripData(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedRoute]);

  const fetchTripStatus = async (routeId) => {
    setLoading(true);
    const { data } = await supabase
      .from('trips')
      .select('*')
      .eq('route_id', routeId)
      .single();

    setTripData(data || null);
    setLoading(false);
  };

  // Tab switching with auth protection
  const handleTabChange = (tab) => {
    if ((tab === 'driver' || tab === 'admin') && !session) {
      setTargetTabAfterLogin(tab);
      setShowLoginModal(true);
      return;
    }
    setActiveTab(tab);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    const { error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: authPassword,
    });

    if (error) {
      setAuthError(error.message);
    } else {
      setShowLoginModal(false);
      setAuthEmail('');
      setAuthPassword('');
      if (targetTabAfterLogin) {
        setActiveTab(targetTabAfterLogin);
      }
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setActiveTab('student');
  };

  return (
    <div style={styles.container}>
      {/* Header Bar */}
      <header style={styles.header}>
        <h1 style={styles.title}>School Bus Tracker</h1>
        <div style={styles.tabContainer}>
          <button
            style={activeTab === 'student' ? styles.activeTab : styles.tab}
            onClick={() => handleTabChange('student')}
          >
            Student View
          </button>
          <button
            style={activeTab === 'driver' ? styles.activeTab : styles.tab}
            onClick={() => handleTabChange('driver')}
          >
            Driver Panel 🔒
          </button>
          <button
            style={activeTab === 'admin' ? styles.activeTab : styles.tab}
            onClick={() => handleTabChange('admin')}
          >
            Admin Panel 🔒
          </button>
          {session && (
            <button style={styles.logoutBtn} onClick={handleLogout}>
              Logout ({session.user.email.split('@')[0]})
            </button>
          )}
        </div>
      </header>

      {/* Main Views */}
      <main style={styles.content}>
        {activeTab === 'student' && (
          <StudentView
            routes={routes}
            selectedRoute={selectedRoute}
            setSelectedRoute={setSelectedRoute}
            tripData={tripData}
            loading={loading}
          />
        )}

        {activeTab === 'driver' && session && (
          <DriverView
            routes={routes}
            selectedRoute={selectedRoute}
            setSelectedRoute={setSelectedRoute}
            tripData={tripData}
            fetchTripStatus={fetchTripStatus}
          />
        )}

        {activeTab === 'admin' && session && (
          <AdminView fetchRoutes={fetchRoutes} />
        )}
      </main>

      {/* Login Modal */}
      {showLoginModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <h2 style={{ marginTop: 0 }}>Login Required</h2>
            <p style={{ color: '#666', fontSize: '14px' }}>
              Please enter authorized credentials to access the {targetTabAfterLogin} panel.
            </p>
            {authError && <div style={styles.errorBanner}>{authError}</div>}
            <form onSubmit={handleLogin} style={styles.form}>
              <input
                type="email"
                placeholder="Email (e.g. admin@school.com)"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                required
                style={styles.input}
              />
              <input
                type="password"
                placeholder="Password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                required
                style={styles.input}
              />
              <div style={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setShowLoginModal(false)}
                  style={styles.cancelBtn}
                >
                  Cancel
                </button>
                <button type="submit" style={styles.primaryBtn}>
                  Log In
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Sub-Component: Student View
function StudentView({ routes, selectedRoute, setSelectedRoute, tripData, loading }) {
  const [stops, setStops] = useState([]);

  useEffect(() => {
    if (selectedRoute) {
      supabase
        .from('route_stops')
        .select('*')
        .eq('route_id', selectedRoute)
        .order('stop_order', { ascending: true })
        .then(({ data }) => setStops(data || []));
    }
  }, [selectedRoute]);

  const currentStop = stops.find((s) => s.id === tripData?.current_stop_id);

  return (
    <div style={styles.card}>
      <h3>Select Route</h3>
      <select
        value={selectedRoute}
        onChange={(e) => setSelectedRoute(e.target.value)}
        style={styles.select}
      >
        {routes.map((r) => (
          <option key={r.id} value={r.id}>
            {r.route_name} ({r.bus_number})
          </option>
        ))}
      </select>

      <div style={styles.statusBox}>
        <h4>Live Status</h4>
        {loading ? (
          <p>Loading bus location...</p>
        ) : tripData?.status === 'in_transit' && currentStop ? (
          <p>
            🚍 Bus is approaching <strong>{currentStop.stop_name}</strong> in approximately{' '}
            <strong>{currentStop.eta_to_next_stop_mins} mins</strong>.
          </p>
        ) : tripData?.status === 'completed' ? (
          <p>✅ Bus has completed its trip for today.</p>
        ) : (
          <p>⏸️ Bus has not started its route yet.</p>
        )}
      </div>

      <h4 style={{ marginTop: '20px' }}>Route Stops Timeline</h4>
      <div style={styles.timeline}>
        {stops.map((stop, idx) => {
          const isReached = idx <= (currentStop?.stop_order ?? -1);
          return (
            <div key={stop.id} style={styles.timelineItem}>
              <div style={isReached ? styles.dotActive : styles.dot} />
              <span>{stop.stop_name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Sub-Component: Driver View
function DriverView({ routes, selectedRoute, setSelectedRoute, tripData, fetchTripStatus }) {
  const [stops, setStops] = useState([]);

  useEffect(() => {
    if (selectedRoute) {
      supabase
        .from('route_stops')
        .select('*')
        .eq('route_id', selectedRoute)
        .order('stop_order', { ascending: true })
        .then(({ data }) => setStops(data || []));
    }
  }, [selectedRoute]);

  const handleStartTrip = async () => {
    if (!stops.length) return;
    await supabase.from('trips').upsert({
      route_id: selectedRoute,
      status: 'in_transit',
      current_stop_id: stops[0].id,
      updated_at: new Date(),
    });
    fetchTripStatus(selectedRoute);
  };

  const handleNextStop = async () => {
    if (!tripData || !stops.length) return;
    const currentIndex = stops.findIndex((s) => s.id === tripData.current_stop_id);
    if (currentIndex < stops.length - 1) {
      const nextStop = stops[currentIndex + 1];
      await supabase.from('trips').update({
        current_stop_id: nextStop.id,
        updated_at: new Date(),
      }).eq('route_id', selectedRoute);
    } else {
      await supabase.from('trips').update({
        status: 'completed',
        updated_at: new Date(),
      }).eq('route_id', selectedRoute);
    }
    fetchTripStatus(selectedRoute);
  };

  return (
    <div style={styles.card}>
      <h3>Driver Control Panel</h3>
      <select
        value={selectedRoute}
        onChange={(e) => setSelectedRoute(e.target.value)}
        style={styles.select}
      >
        {routes.map((r) => (
          <option key={r.id} value={r.id}>
            {r.route_name} ({r.bus_number})
          </option>
        ))}
      </select>

      <div style={{ marginTop: '20px' }}>
        {tripData?.status !== 'in_transit' ? (
          <button style={styles.primaryBtn} onClick={handleStartTrip}>
            ▶️ Start Route Trip
          </button>
        ) : (
          <button style={styles.actionBtn} onClick={handleNextStop}>
            ➡️ Arrived at Next Stop
          </button>
        )}
      </div>
    </div>
  );
}

// Sub-Component: Admin View
function AdminView({ fetchRoutes }) {
  const [routeName, setRouteName] = useState('');
  const [busNumber, setBusNumber] = useState('');
  const [driverName, setDriverName] = useState('');

  const handleCreateRoute = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('routes').insert([
      {
        route_name: routeName,
        bus_number: busNumber,
        driver_name: driverName,
      },
    ]);

    if (!error) {
      setRouteName('');
      setBusNumber('');
      setDriverName('');
      fetchRoutes();
      alert('New route created successfully!');
    } else {
      alert(error.message);
    }
  };

  return (
    <div style={styles.card}>
      <h3>Admin Panel - Add Route</h3>
      <form onSubmit={handleCreateRoute} style={styles.form}>
        <input
          type="text"
          placeholder="Route Name (e.g. Route 3 - South Express)"
          value={routeName}
          onChange={(e) => setRouteName(e.target.value)}
          required
          style={styles.input}
        />
        <input
          type="text"
          placeholder="Bus Number (e.g. BUS-103)"
          value={busNumber}
          onChange={(e) => setBusNumber(e.target.value)}
          required
          style={styles.input}
        />
        <input
          type="text"
          placeholder="Driver Name"
          value={driverName}
          onChange={(e) => setDriverName(e.target.value)}
          required
          style={styles.input}
        />
        <button type="submit" style={styles.primaryBtn}>
          + Create Route
        </button>
      </form>
    </div>
  );
}

// Component Styles
const styles = {
  container: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    maxWidth: '800px',
    margin: '0 auto',
    padding: '20px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    borderBottom: '2px solid #eee',
    paddingBottom: '10px',
  },
  title: { margin: 0, fontSize: '22px', color: '#111' },
  tabContainer: { display: 'flex', gap: '8px', alignItems: 'center' },
  tab: {
    padding: '8px 14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    background: '#fff',
    cursor: 'pointer',
  },
  activeTab: {
    padding: '8px 14px',
    border: '1px solid #0066cc',
    borderRadius: '6px',
    background: '#0066cc',
    color: '#fff',
    cursor: 'pointer',
  },
  logoutBtn: {
    padding: '8px 12px',
    border: '1px solid #ff4d4f',
    background: '#fff',
    color: '#ff4d4f',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  card: {
    background: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    padding: '20px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
  },
  select: {
    width: '100%',
    padding: '10px',
    borderRadius: '6px',
    border: '1px solid #ccc',
    marginTop: '10px',
  },
  statusBox: {
    background: '#f8f9fa',
    padding: '15px',
    borderRadius: '6px',
    marginTop: '15px',
    borderLeft: '4px solid #0066cc',
  },
  timeline: { marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '10px' },
  timelineItem: { display: 'flex', alignItems: 'center', gap: '10px' },
  dot: { width: '12px', height: '12px', borderRadius: '50%', background: '#ccc' },
  dotActive: { width: '12px', height: '12px', borderRadius: '50%', background: '#28a745' },
  form: { display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' },
  input: { padding: '10px', borderRadius: '6px', border: '1px solid #ccc' },
  primaryBtn: {
    padding: '10px',
    borderRadius: '6px',
    border: 'none',
    background: '#0066cc',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  actionBtn: {
    padding: '10px 16px',
    borderRadius: '6px',
    border: 'none',
    background: '#28a745',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBox: {
    background: '#fff',
    padding: '25px',
    borderRadius: '8px',
    width: '90%',
    maxWidth: '400px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' },
  cancelBtn: {
    padding: '10px',
    borderRadius: '6px',
    border: '1px solid #ccc',
    background: '#fff',
    cursor: 'pointer',
  },
  errorBanner: {
    padding: '8px',
    background: '#ffe6e6',
    color: '#cc0000',
    borderRadius: '4px',
    fontSize: '13px',
    marginBottom: '10px',
  },
};