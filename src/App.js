import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function App() {
  const [role, setRole] = useState('student'); // 'student', 'driver', 'admin'
  const [routes, setRoutes] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState('');

  const loadRoutes = async () => {
    const { data, error } = await supabase.from('routes').select('*').order('created_at', { ascending: true });
    if (error) console.error('Error fetching routes:', error);
    else {
      setRoutes(data || []);
      if (data && data.length > 0 && !selectedRouteId) {
        setSelectedRouteId(data[0].id);
      } else if (data.length === 0) {
        setSelectedRouteId('');
      }
    }
  };

  useEffect(() => {
    loadRoutes();
  }, []);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1>🚌 School Bus Tracker</h1>
        <div style={styles.roleToggle}>
          <button style={role === 'student' ? styles.activeBtn : styles.btn} onClick={() => setRole('student')}>Student</button>
          <button style={role === 'driver' ? styles.activeBtn : styles.btn} onClick={() => setRole('driver')}>Driver</button>
          <button style={role === 'admin' ? styles.activeBtn : styles.btn} onClick={() => setRole('admin')}>Admin</button>
        </div>
      </header>

      {/* Route Selector (Hidden on Admin screen to avoid confusion) */}
      {role !== 'admin' && routes.length > 0 && (
        <div style={styles.card}>
          <label><strong>Select Route: </strong></label>
          <select value={selectedRouteId} onChange={(e) => setSelectedRouteId(e.target.value)} style={styles.select}>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>{r.route_name} ({r.bus_number})</option>
            ))}
          </select>
        </div>
      )}

      {/* Render Active View */}
      {role === 'admin' && <AdminView onRouteChanged={loadRoutes} routes={routes} />}
      {role === 'driver' && selectedRouteId && <DriverView routeId={selectedRouteId} />}
      {role === 'student' && selectedRouteId && <StudentView routeId={selectedRouteId} />}
      
      {role !== 'admin' && routes.length === 0 && (
        <p style={{textAlign: 'center'}}>No routes available. Ask an Admin to create one.</p>
      )}
    </div>
  );
}

// ==========================================
// 1. ADMIN VIEW COMPONENT
// ==========================================
function AdminView({ onRouteChanged, routes }) {
  const [routeName, setRouteName] = useState('');
  const [busNumber, setBusNumber] = useState('');
  
  const [targetRouteId, setTargetRouteId] = useState('');
  const [editRouteName, setEditRouteName] = useState('');
  const [editBusNumber, setEditBusNumber] = useState('');

  const [stopName, setStopName] = useState('');
  const [sequenceOrder, setSequenceOrder] = useState('1');
  const [etaMins, setEtaMins] = useState('10');
  const [routeStops, setRouteStops] = useState([]);

  useEffect(() => {
    if (routes.length > 0 && !targetRouteId) {
      setTargetRouteId(routes[0].id);
    }
  }, [routes, targetRouteId]);

  useEffect(() => {
    if (targetRouteId) {
      const selected = routes.find(r => r.id === targetRouteId);
      if (selected) {
        setEditRouteName(selected.route_name);
        setEditBusNumber(selected.bus_number);
      }
      fetchStopsForAdmin(targetRouteId);
    }
  }, [targetRouteId, routes]);

  const fetchStopsForAdmin = async (routeId) => {
    const { data } = await supabase.from('stops').select('*').eq('route_id', routeId).order('sequence_order', { ascending: true });
    setRouteStops(data || []);
  };

  // -- ROUTE ACTIONS --
  const handleCreateRoute = async (e) => {
    e.preventDefault();
    if (!routeName || !busNumber) return alert('Enter Route Name and Bus Number.');
    const { data: newRoute, error: routeError } = await supabase.from('routes').insert([{ route_name: routeName, bus_number: busNumber }]).select().single();
    if (routeError) return alert('Error: ' + routeError.message);
    await supabase.from('active_trips').insert([{ route_id: newRoute.id, status: 'not_started' }]);
    alert('Route Created!');
    setRouteName(''); setBusNumber('');
    onRouteChanged();
  };

  const handleUpdateRoute = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('routes').update({ route_name: editRouteName, bus_number: editBusNumber }).eq('id', targetRouteId);
    if (error) alert('Error: ' + error.message);
    else { alert('Route Updated!'); onRouteChanged(); }
  };

  const handleDeleteRoute = async () => {
    if (!window.confirm('WARNING: This deletes the route, all its stops, and trip history. Continue?')) return;
    await supabase.from('routes').delete().eq('id', targetRouteId);
    alert('Route Deleted!');
    setTargetRouteId('');
    onRouteChanged();
  };

  const handleResetTrip = async () => {
    if (!window.confirm('Reset this route for a new day? (Will reset to Not Started)')) return;
    await supabase.from('active_trips').update({ current_stop_id: null, status: 'not_started', updated_at: new Date().toISOString() }).eq('route_id', targetRouteId);
    alert('Trip Reset for tomorrow!');
  };

  // -- STOP ACTIONS --
  const handleAddStop = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('stops').insert([{ route_id: targetRouteId, stop_name: stopName, sequence_order: parseInt(sequenceOrder), eta_to_next_stop_mins: parseInt(etaMins) }]);
    if (error) alert('Error: ' + error.message);
    else {
      setStopName(''); setSequenceOrder(prev => (parseInt(prev) + 1).toString());
      fetchStopsForAdmin(targetRouteId);
    }
  };

  const handleDeleteStop = async (stopId) => {
    if (!window.confirm('Delete this stop?')) return;
    await supabase.from('stops').delete().eq('id', stopId);
    fetchStopsForAdmin(targetRouteId);
  };

  return (
    <div>
      {/* 1. Create New Route */}
      <div style={styles.card}>
        <h2>➕ Create New Route</h2>
        <form onSubmit={handleCreateRoute} style={styles.form}>
          <input type="text" placeholder="Route Name" value={routeName} onChange={(e) => setRouteName(e.target.value)} style={styles.input} />
          <input type="text" placeholder="Bus Number" value={busNumber} onChange={(e) => setBusNumber(e.target.value)} style={styles.input} />
          <button type="submit" style={styles.primaryBtn}>Create Route</button>
        </form>
      </div>

      {routes.length > 0 && (
        <>
          {/* Admin Target Selector */}
          <div style={{...styles.card, backgroundColor: '#f8fafc', borderColor: '#cbd5e1'}}>
            <label><strong>⚙️ Manage Existing Route:</strong></label>
            <select value={targetRouteId} onChange={(e) => setTargetRouteId(e.target.value)} style={styles.select}>
              {routes.map((r) => <option key={r.id} value={r.id}>{r.route_name}</option>)}
            </select>
          </div>

          {/* 2. Edit / Delete Route */}
          <div style={styles.card}>
            <h2>✏️ Edit or Delete Route</h2>
            <form onSubmit={handleUpdateRoute} style={styles.form}>
              <input type="text" value={editRouteName} onChange={(e) => setEditRouteName(e.target.value)} style={styles.input} />
              <input type="text" value={editBusNumber} onChange={(e) => setEditBusNumber(e.target.value)} style={styles.input} />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="submit" style={{ ...styles.primaryBtn, backgroundColor: '#eab308', flex: 1 }}>Save Edits</button>
                <button type="button" onClick={handleDeleteRoute} style={{ ...styles.primaryBtn, backgroundColor: '#ef4444', flex: 1 }}>Delete Route</button>
              </div>
              <button type="button" onClick={handleResetTrip} style={{ ...styles.primaryBtn, backgroundColor: '#64748b', marginTop: '10px' }}>🔄 Reset Trip For Next Day</button>
            </form>
          </div>

          {/* 3. Manage Stops */}
          <div style={styles.card}>
            <h2>📍 Manage Stops</h2>
            <form onSubmit={handleAddStop} style={styles.form}>
              <input type="text" placeholder="New Stop Name" value={stopName} onChange={(e) => setStopName(e.target.value)} style={styles.input} />
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}><label><small>Order Number:</small></label><input type="number" value={sequenceOrder} onChange={(e) => setSequenceOrder(e.target.value)} style={styles.input} /></div>
                <div style={{ flex: 1 }}><label><small>ETA to Next (mins):</small></label><input type="number" value={etaMins} onChange={(e) => setEtaMins(e.target.value)} style={styles.input} /></div>
              </div>
              <button type="submit" style={styles.primaryBtn}>Add Stop</button>
            </form>

            <div style={{ marginTop: '20px' }}>
              {routeStops.map(stop => (
                <div key={stop.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', borderBottom: '1px solid #eee' }}>
                  <span>{stop.sequence_order}. {stop.stop_name}</span>
                  <button onClick={() => handleDeleteStop(stop.id)} style={{ color: 'red', background: 'none', border: 'none', cursor: 'pointer' }}>✖</button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ==========================================
// 2. DRIVER VIEW COMPONENT
// ==========================================
function DriverView({ routeId }) {
  const [stops, setStops] = useState([]);
  const [tripData, setTripData] = useState(null);

  useEffect(() => {
    async function loadData() {
      const { data: sData } = await supabase.from('stops').select('*').eq('route_id', routeId).order('sequence_order', { ascending: true });
      setStops(sData || []);
      const { data: tData } = await supabase.from('active_trips').select('*').eq('route_id', routeId).maybeSingle();
      setTripData(tData);
    }
    loadData();
  }, [routeId]);

  const updateTrip = async (updates) => {
    await supabase.from('active_trips').update({ ...updates, updated_at: new Date().toISOString() }).eq('route_id', routeId);
    const { data: tData } = await supabase.from('active_trips').select('*').eq('route_id', routeId).maybeSingle();
    setTripData(tData);
  };

  if (!tripData) return <p>Loading driver panel...</p>;

  return (
    <div style={styles.card}>
      <h2>Driver Panel</h2>
      
      {tripData.status === 'not_started' && (
        <button onClick={() => updateTrip({ status: 'in_transit' })} style={{...styles.primaryBtn, width: '100%', padding: '15px', backgroundColor: '#22c55e', fontSize: '18px'}}>
          ▶ Start Today's Trip
        </button>
      )}

      {tripData.status === 'completed' && (
        <div style={{textAlign: 'center', color: '#16a34a', padding: '20px'}}>
          <h3>✅ Trip Completed!</h3>
          <p>Great job. See you tomorrow.</p>
        </div>
      )}

      {tripData.status === 'in_transit' && (
        <>
          <p>Tap a stop below when you reach it:</p>
          <div style={styles.stopList}>
            {stops.map((stop, index) => {
              const isCurrent = stop.id === tripData.current_stop_id;
              const isLastStop = index === stops.length - 1;
              return (
                <div key={stop.id} style={{ ...styles.stopItem, borderColor: isCurrent ? '#22c55e' : '#ccc', backgroundColor: isCurrent ? '#f0fdf4' : '#fff' }}>
                  <div>
                    <strong>{stop.sequence_order}. {stop.stop_name}</strong>
                    {isCurrent && <span style={styles.badge}>CURRENT</span>}
                  </div>
                  {isLastStop && isCurrent ? (
                    <button onClick={() => updateTrip({ status: 'completed' })} style={{...styles.reachedBtn, backgroundColor: '#ef4444'}}>End Trip</button>
                  ) : (
                    <button onClick={() => updateTrip({ current_stop_id: stop.id })} style={isCurrent ? styles.reachedBtn : styles.markBtn}>
                      {isCurrent ? 'Reached ✓' : 'Mark Reached'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ==========================================
// 3. STUDENT VIEW COMPONENT (REALTIME)
// ==========================================
function StudentView({ routeId }) {
  const [tripData, setTripData] = useState(null);
  const [allStops, setAllStops] = useState([]);

  const fetchTripStatus = async () => {
    const { data: stopsData } = await supabase.from('stops').select('*').eq('route_id', routeId).order('sequence_order', { ascending: true });
    setAllStops(stopsData || []);

    const { data: activeTrip } = await supabase.from('active_trips').select('*, stops(*)').eq('route_id', routeId).maybeSingle();
    setTripData(activeTrip);
  };

  useEffect(() => {
    fetchTripStatus();
    const channel = supabase.channel('realtime_bus_' + routeId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'active_trips', filter: `route_id=eq.${routeId}` }, () => {
        fetchTripStatus();
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [routeId]);

  if (!tripData) return <p>Loading bus location...</p>;

  const currentStop = tripData.stops;
  const nextStop = allStops.find(s => currentStop && s.sequence_order === currentStop.sequence_order + 1);
  const timeUpdated = new Date(tripData.updated_at).toLocaleTimeString();

  return (
    <div style={styles.card}>
      <h2>Live Bus Location</h2>
      
      {tripData.status === 'not_started' && (
        <div style={{...styles.statusBox, backgroundColor: '#fef3c7', color: '#b45309'}}>
          <strong>⏳ Bus is waiting to start the route.</strong>
        </div>
      )}

      {tripData.status === 'completed' && (
        <div style={{...styles.statusBox, backgroundColor: '#dcfce7', color: '#16a34a'}}>
          <strong>✅ The bus has completed its route for today.</strong>
        </div>
      )}

      {tripData.status === 'in_transit' && currentStop && (
        <div style={styles.statusBox}>
          <div style={styles.statusItem}>
            <span>📍 Currently At:</span>
            <strong style={{ fontSize: '20px', color: '#2563eb' }}>{currentStop.stop_name}</strong>
          </div>
          {nextStop ? (
            <div style={styles.statusItem}>
              <span>➡️ Next Stop:</span>
              <strong>{nextStop.stop_name} (Est. {currentStop.eta_to_next_stop_mins} mins)</strong>
            </div>
          ) : (
            <div style={styles.statusItem}><strong>Arriving at Final Destination!</strong></div>
          )}
          <p style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>Last updated: {timeUpdated}</p>
        </div>
      )}
    </div>
  );
}

// Inline Styles
const styles = {
  container: { fontFamily: 'sans-serif', maxWidth: '650px', margin: '20px auto', padding: '0 15px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' },
  roleToggle: { display: 'flex', gap: '8px' },
  btn: { padding: '8px 12px', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer', background: '#f5f5f5', fontWeight: 'bold' },
  activeBtn: { padding: '8px 12px', border: '1px solid #2563eb', borderRadius: '6px', cursor: 'pointer', background: '#2563eb', color: '#fff', fontWeight: 'bold' },
  card: { border: '1px solid #e5e7eb', borderRadius: '8px', padding: '20px', marginBottom: '20px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', backgroundColor: '#fff' },
  select: { padding: '10px', width: '100%', marginTop: '8px', marginBottom: '12px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '16px' },
  input: { padding: '10px', width: '100%', marginBottom: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box', fontSize: '15px' },
  form: { display: 'flex', flexDirection: 'column', gap: '5px' },
  primaryBtn: { backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px' },
  stopList: { display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px' },
  stopItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', border: '2px solid', borderRadius: '8px' },
  badge: { backgroundColor: '#22c55e', color: '#fff', fontSize: '11px', padding: '4px 8px', borderRadius: '12px', marginLeft: '10px', fontWeight: 'bold' },
  markBtn: { backgroundColor: '#3b82f6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  reachedBtn: { backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold' },
  statusBox: { backgroundColor: '#f8fafc', padding: '20px', borderRadius: '8px', marginTop: '10px', border: '1px solid #e2e8f0' },
  statusItem: { margin: '12px 0', display: 'flex', flexDirection: 'column' }
};