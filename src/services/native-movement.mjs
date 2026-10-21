import {actorMovement} from "./turn-budget.mjs";
import {actorContributions} from "./conditions.mjs";
import {conditionSummary} from "../rules/conditions.mjs";
export const MOVEMENT_COLORS={normal:0x36a65c,double:0xe5bb35,excess:0xd34b45};
export function movementBandColor(cost,speed) {return cost<=speed?MOVEMENT_COLORS.normal:cost<=2*speed?MOVEMENT_COLORS.double:MOVEMENT_COLORS.excess;}
/** Native V14 TokenRuler handles pathfinding, costs, history and rendering. */
export function registerNativeMovement() {
  const Base=CONFIG.Token.rulerClass;
  CONFIG.Token.rulerClass=class HOLTokenRuler extends Base {
    _holColor(waypoint) {
      const actor=this.token.actor;if(!actor || !this.token.document.inCombat)return null;
      let speed;try{speed=actorMovement(actor).speed-conditionSummary(actorContributions(actor)).slowed.rating;}catch{return null;}
      const distance=canvas.grid.distance??1;
      return movementBandColor(waypoint.measurement?.cost??0,Math.max(0,speed)*distance);
    }
    _getSegmentStyle(waypoint){const style=super._getSegmentStyle(waypoint),color=this._holColor(waypoint);return color===null?style:{...style,color};}
    _getGridHighlightStyle(waypoint,offset){const style=super._getGridHighlightStyle(waypoint,offset),color=this._holColor(waypoint);return color===null?style:{...style,color};}
  };
}
