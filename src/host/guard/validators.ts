import { defineDomain, type DomainValidator } from '../store/index.js'

const guardValidator: DomainValidator = {
  parse(v:any) {
    if (v==null) return {ok:true}
    if (typeof v!=='object' || Array.isArray(v)) return {ok:false, error:'guard must be object'}
    if (typeof v.publishBlocked!=='undefined' && typeof v.publishBlocked!=='boolean') return {ok:false, error:'publishBlocked boolean'}
    if (v.gitProtection) {
      const gp=v.gitProtection
      if (typeof gp.enabled!=='boolean') return {ok:false, error:'gitProtection.enabled boolean'}
      if (!Array.isArray(gp.branches) || gp.branches.some((b:any)=>typeof b!=='string' || !b.trim())) return {ok:false, error:'branches string[]'}
    }
    if (v.credentialPaths && (!Array.isArray(v.credentialPaths) || v.credentialPaths.some((p:any)=>typeof p!=='string'))) return {ok:false, error:'credentialPaths string[]'}
    if (v.cwdContainment!==undefined && typeof v.cwdContainment!=='boolean') return {ok:false, error:'cwdContainment boolean'}
    return {ok:true}
  }
}
try { defineDomain('guard', guardValidator) } catch {}
const guardBlacklistValidator: DomainValidator = {
  parse(v:any) {
    if (v==null) return {ok:true}
    if (typeof v!=='object') return {ok:false, error:'guardBlacklist object'}
    if (v.patterns && !Array.isArray(v.patterns)) return {ok:false, error:'patterns array'}
    if (v.placeholders && typeof v.placeholders!=='object') return {ok:false, error:'placeholders object'}
    return {ok:true}
  }
}
try { defineDomain('guardBlacklist', guardBlacklistValidator) } catch {}
export { guardValidator, guardBlacklistValidator }
