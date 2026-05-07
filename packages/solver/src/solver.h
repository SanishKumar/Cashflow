#ifndef CASHFLOW_SOLVER_H
#define CASHFLOW_SOLVER_H

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Solve debt minimization.
 * 
 * @param json_input JSON string with format:
 *   {"edges":[{"from":0,"to":1,"amount":100},...], "numNodes": N}
 *   OR just an edge array: [{"from":0,"to":1,"amount":100},...]
 * 
 * @return JSON string: [{"from":0,"to":1,"amount":50},...]
 *   Caller must call free_result() when done.
 */
const char* solve(const char* json_input);

/**
 * Free the last result returned by solve().
 */
void free_result(void);

/**
 * Get solver version (major * 100 + minor).
 */
int get_version(void);

#ifdef __cplusplus
}
#endif

#endif // CASHFLOW_SOLVER_H
