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
          table: 'active_trips',
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
      .from('active_trips')
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
        <h1 style={styles.title}>🚍 School Bus Tracker</h1>
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
          <AdminView routes={routes} fetchRoutes={fetchRoutes} fetchTripStatus={fetchTripStatus} selectedRoute={selectedRoute} />
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
        .from('stops')
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
            🚍 {r.route_name} ({r.bus_number})
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
            <strong>{currentStop.eta_to_next_stop_mins || 5} mins</strong>.
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
        .from('stops')
        .select('*')
        .eq('route_id', selectedRoute)
        .order('stop_order', { ascending: true })
        .then(({ data }) => setStops(data || []));
    }
  }, [selectedRoute]);

  const handleStartTrip = async () => {
    if (!stops.length) return;
    await supabase.from('active_trips').upsert({
      route_id: selectedRoute,
      status: 'in_transit',
      current_stop_id: stops[0].id,
      updated_at: new Date(),
    }, { onConflict: 'route_id' });
    fetchTripStatus(selectedRoute);
  };

  const handleMarkReached = async (stopId) => {
    await supabase.from('active_trips').update({
      status: 'in_transit',
      current_stop_id: stopId,
      updated_at: new Date(),
    }).eq('route_id', selectedRoute);
    fetchTripStatus(selectedRoute);
  };

  const handleCompleteTrip = async () => {
    await supabase.from('active_trips').update({
      status: 'completed',
      updated_at: new Date(),
    }).eq('route_id', selectedRoute);
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
            🚍 {r.route_name} ({r.bus_number})
          </option>
        ))}
      </select>

      <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
        {(!tripData || tripData.status !== 'in_transit') ? (
          <button style={styles.primaryBtn} onClick={handleStartTrip}>
            ▶️ Start Route Trip
          </button>
        ) : (
          <button style={styles.deleteBtn} onClick={handleCompleteTrip}>
            🏁 End / Complete Trip
          </button>
        )}
      </div>

      <h4 style={{ marginTop: '25px' }}>Route Stops (Click when arrived)</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
        {stops.map((stop, index) => {
          const isCurrent = tripData?.current_stop_id === stop.id;
          return (
            <div
              key={stop.id}
              style={{
                ...styles.stopRow,
                border: isCurrent ? '2px solid #0066cc' : '1px solid #eee',
                background: isCurrent ? '#f0f7ff' : '#f9f9f9',
              }}
            >
              <div>
                <strong>{index + 1}. {stop.stop_name}</strong>
                {isCurrent && <span style={styles.badge}>Current Target</span>}
              </div>
              <button
                onClick={() => handleMarkReached(stop.id)}
                style={isCurrent ? styles.actionBtnActive : styles.actionBtn}
              >
                Mark as Reached
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Sub-Component: Admin View with Reset Trip Control
function AdminView({ routes, fetchRoutes, fetchTripStatus, selectedRoute }) {
  const [routeName, setRouteName] = useState('');
  const [busNumber, setBusNumber] = useState('');
  const [driverName, setDriverName] = useState('');

  const [editingRouteId, setEditingRouteId] = useState(null);
  const [editRouteName, setEditRouteName] = useState('');
  const [editBusNumber, setEditBusNumber] = useState('');
  const [editDriverName, setEditDriverName] = useState('');

  const [selectedAdminRoute, setSelectedAdminRoute] = useState('');
  const [stops, setStops] = useState([]);
  const [newStopName, setNewStopName] = useState('');
  const [stopNumberInput, setStopNumberInput] = useState('');
  const [newEta, setNewEta] = useState(5);

  useEffect(() => {
    if (routes.length > 0 && !selectedAdminRoute) {
      setSelectedAdminRoute(routes[0].id);
    }
  }, [routes, selectedAdminRoute]);

  useEffect(() => {
    if (selectedAdminRoute) {
      fetchStops(selectedAdminRoute);
    }
  }, [selectedAdminRoute]);

  const fetchStops = async (routeId) => {
    const { data } = await supabase
      .from('stops')
      .select('*')
      .eq('route_id', routeId)
      .order('stop_order', { ascending: true });
    setStops(data || []);
  };

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

  const handleStartEdit = (route) => {
    setEditingRouteId(route.id);
    setEditRouteName(route.route_name);
    setEditBusNumber(route.bus_number);
    setEditDriverName(route.driver_name || '');
  };

  const handleSaveEdit = async (routeId) => {
    const { error } = await supabase
      .from('routes')
      .update({
        route_name: editRouteName,
        bus_number: editBusNumber,
        driver_name: editDriverName,
      })
      .eq('id', routeId);

    if (!error) {
      setEditingRouteId(null);
      fetchRoutes();
    } else {
      alert(error.message);
    }
  };

  const handleDeleteRoute = async (routeId) => {
    if (!window.confirm('Are you sure you want to delete this route? All related stops will be deleted.')) return;

    await supabase.from('stops').delete().eq('route_id', routeId);
    await supabase.from('active_trips').delete().eq('route_id', routeId);
    const { error } = await supabase.from('routes').delete().eq('id', routeId);

    if (!error) {
      fetchRoutes();
    } else {
      alert(error.message);
    }
  };

  const handleResetTrip = async (routeId) => {
    if (!window.confirm('Are you sure you want to reset the trip for this route? This will clear out the completed status and allow the driver to start fresh.')) return;
    
    const { error } = await supabase.from('active_trips').delete().eq('route_id', routeId);
    
    if (!error) {
      alert('Trip reset successfully! The driver can now start this route fresh.');
      if (selectedRoute === routeId) {
        fetchTripStatus(routeId);
      }
    } else {
      alert(error.message);
    }
  };

  const handleAddStop = async (e) => {
    e.preventDefault();
    if (!selectedAdminRoute) return;

    const assignedOrder = stopNumberInput !== '' ? parseInt(stopNumberInput, 10) - 1 : stops.length;

    const { error } = await supabase.from('stops').insert([
      {
        route_id: selectedAdminRoute,
        stop_name: newStopName,
        stop_order: isNaN(assignedOrder) ? stops.length : assignedOrder,
        eta_to_next_stop_mins: parseInt(newEta, 10) || 5,
      },
    ]);

    if (!error) {
      setNewStopName('');
      setStopNumberInput('');
      setNewEta(5);
      fetchStops(selectedAdminRoute);
    } else {
      alert(error.message);
    }
  };

  const handleDeleteStop = async (stopId) => {
    const { error } = await supabase.from('stops').delete().eq('id', stopId);
    if (!error) {
      fetchStops(selectedAdminRoute);
    } else {
      alert(error.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={styles.card}>
        <h3>+ Create New Route</h3>
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
            + Add Route
          </button>
        </form>
      </div>

      <div style={styles.card}>
        <h3>Manage Existing Routes & Trips</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
          {routes.map((route) => (
            <div key={route.id} style={styles.routeRow}>
              {editingRouteId === route.id ? (
                <div style={{ display: 'flex', gap: '10px', flex: 1, flexWrap: 'wrap' }}>
                  <input
                    value={editRouteName}
                    onChange={(e) => setEditRouteName(e.target.value)}
                    style={styles.inputSmall}
                  />
                  <input
                    value={editBusNumber}
                    onChange={(e) => setEditBusNumber(e.target.value)}
                    style={styles.inputSmall}
                  />
                  <input
                    value={editDriverName}
                    onChange={(e) => setEditDriverName(e.target.value)}
                    style={styles.inputSmall}
                  />
                  <button onClick={() => handleSaveEdit(route.id)} style={styles.saveBtn}>
                    Save
                  </button>
                  <button onClick={() => setEditingRouteId(null)} style={styles.cancelBtnSmall}>
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <strong>🚍 {route.route_name}</strong> ({route.bus_number}) - Driver: {route.driver_name || 'N/A'}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => handleResetTrip(route.id)} style={styles.resetBtn}>
                      🔄 Reset Trip
                    </button>
                    <button onClick={() => handleStartEdit(route)} style={styles.editBtn}>
                      ✏️ Edit
                    </button>
                    <button onClick={() => handleDeleteRoute(route.id)} style={styles.deleteBtn}>
                      🗑️ Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={styles.card}>
        <h3>Manage Route Stops</h3>
        <select
          value={selectedAdminRoute}
          onChange={(e) => setSelectedAdminRoute(e.target.value)}
          style={styles.select}
        >
          {routes.map((r) => (
            <option key={r.id} value={r.id}>
              🚍 {r.route_name}
            </option>
          ))}
        </select>

        <form onSubmit={handleAddStop} style={{ ...styles.form, flexDirection: 'column', marginTop: '15px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              placeholder="Stop Name (e.g. Oak Street)"
              value={newStopName}
              onChange={(e) => setNewStopName(e.target.value)}
              required
              style={{ ...styles.input, flex: 2 }}
            />
            <input
              type="number"
              placeholder="Stop No. (e.g. 1, 2, 3)"
              value={stopNumberInput}
              onChange={(e) => setStopNumberInput(e.target.value)}
              style={{ ...styles.input, flex: 1 }}
            />
            <input
              type="number"
              placeholder="ETA Mins"
              value={newEta}
              onChange={(e) => setNewEta(e.target.value)}
              required
              style={{ ...styles.input, flex: 1 }}
            />
          </div>
          <button type="submit" style={styles.primaryBtn}>
            + Add Stop
          </button>
        </form>

        <h4 style={{ marginTop: '20px' }}>Current Stops Sequence</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {stops.map((stop, index) => (
            <div key={stop.id} style={styles.stopRow}>
              <span>
                {index + 1}. <strong>{stop.stop_name}</strong> (Stop No: {stop.stop_order + 1}, {stop.eta_to_next_stop_mins || 5} mins)
              </span>
              <button onClick={() => handleDeleteStop(stop.id)} style={styles.deleteBtnSmall}>
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>
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
  inputSmall: { padding: '6px 10px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '13px' },
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
    padding: '6px 12px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    background: '#fff',
    color: '#333',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 'bold',
  },
  actionBtnActive: {
    padding: '6px 12px',
    borderRadius: '4px',
    border: 'none',
    background: '#28a745',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 'bold',
  },
  resetBtn: {
    padding: '6px 10px',
    borderRadius: '4px',
    border: 'none',
    background: '#ffc107',
    color: '#000',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 'bold',
  },
  editBtn: {
    padding: '6px 10px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    background: '#f0f0f0',
    cursor: 'pointer',
    fontSize: '12px',
  },
  saveBtn: {
    padding: '6px 10px',
    borderRadius: '4px',
    border: 'none',
    background: '#28a745',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '12px',
  },
  deleteBtn: {
    padding: '10px 16px',
    borderRadius: '6px',
    border: 'none',
    background: '#ff4d4f',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '14px',
  },
  deleteBtnSmall: {
    padding: '4px 8px',
    borderRadius: '4px',
    border: 'none',
    background: '#ff4d4f',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '11px',
  },
  cancelBtnSmall: {
    padding: '6px 10px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    background: '#fff',
    cursor: 'pointer',
    fontSize: '12px',
  },
  routeRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px',
    border: '1px solid #eee',
    borderRadius: '6px',
    background: '#fafafa',
  },
  stopRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    borderRadius: '6px',
    background: '#f9f9f9',
  },
  badge: {
    marginLeft: '10px',
    padding: '2px 8px',
    background: '#0066cc',
    color: '#fff',
    borderRadius: '10px',
    fontSize: '11px',
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