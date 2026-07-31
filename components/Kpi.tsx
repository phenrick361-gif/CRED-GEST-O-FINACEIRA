export default function Kpi({label,value,detail,icon}:{label:string;value:string|number;detail:string;icon?:string}) {
  return <div className="kpi"><span className="kpi-icon">{icon||'📊'}</span><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div><div className="muted">{detail}</div></div>;
}
