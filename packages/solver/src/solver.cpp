// ──────────────────────────────────────────────────────────
// CashFlow Debt Minimization Solver — C++ Core
// ──────────────────────────────────────────────────────────
// High-performance implementation of the Max Heap debt
// minimization algorithm. Compiled to WebAssembly via
// Emscripten for cross-platform portability.
//
// Algorithm origin: Codeforces 1266D (Decreasing Debts)
// Mathematical integrity preserved from original JS impl.
// ──────────────────────────────────────────────────────────

#include <vector>
#include <queue>
#include <string>
#include <cmath>
#include <sstream>
#include <cstring>
#include <cstdlib>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

// ── Data Structures ────────────────────────────────────

struct Edge {
    int from;
    int to;
    double amount;
};

struct Settlement {
    int from;
    int to;
    double amount;
};

// ── JSON Parser (minimal, no external deps) ────────────

// Simple JSON array parser for input format:
// [{"from":0,"to":1,"amount":100.5},...]
static std::vector<Edge> parse_edges(const char* json) {
    std::vector<Edge> edges;
    const char* p = json;
    
    // Find first '['
    while (*p && *p != '[') p++;
    if (!*p) return edges;
    p++;
    
    while (*p) {
        // Find next '{'
        while (*p && *p != '{' && *p != ']') p++;
        if (!*p || *p == ']') break;
        p++;
        
        Edge edge = {0, 0, 0.0};
        
        // Parse key-value pairs in this object
        while (*p && *p != '}') {
            // Find key
            while (*p && *p != '"') p++;
            if (!*p) break;
            p++;
            
            // Read key name
            std::string key;
            while (*p && *p != '"') {
                key += *p;
                p++;
            }
            if (!*p) break;
            p++;
            
            // Find ':'
            while (*p && *p != ':') p++;
            if (!*p) break;
            p++;
            
            // Skip whitespace
            while (*p && (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r')) p++;
            
            // Read value (number)
            std::string val;
            while (*p && *p != ',' && *p != '}') {
                if (*p != ' ' && *p != '\t' && *p != '\n' && *p != '\r') {
                    val += *p;
                }
                p++;
            }
            
            if (key == "from") {
                edge.from = std::atoi(val.c_str());
            } else if (key == "to") {
                edge.to = std::atoi(val.c_str());
            } else if (key == "amount") {
                edge.amount = std::atof(val.c_str());
            }
        }
        
        if (*p == '}') p++;
        
        edges.push_back(edge);
    }
    
    return edges;
}

// ── Core Solver ────────────────────────────────────────

/**
 * Minimize debts using Max Heap greedy algorithm.
 *
 * Algorithm:
 * 1. Compute net balance for each node from directed edges.
 * 2. Separate into creditor max-heap (positive) and debtor max-heap (negative).
 * 3. Greedily match: extract max creditor and max debtor.
 * 4. Settle min(credit, debt), re-insert remainder.
 * 5. Continue until both heaps are empty.
 *
 * Produces optimal O(N-1) settlement graph.
 * Time complexity: O(E + N log N)
 */
static std::vector<Settlement> solve_debts(const std::vector<Edge>& edges, int num_nodes) {
    std::vector<Settlement> settlements;
    
    if (edges.empty() || num_nodes <= 0) return settlements;
    
    // Step 1: Compute net balances
    std::vector<double> balances(num_nodes, 0.0);
    
    for (const auto& edge : edges) {
        if (edge.from >= 0 && edge.from < num_nodes &&
            edge.to >= 0 && edge.to < num_nodes) {
            balances[edge.to] += edge.amount;
            balances[edge.from] -= edge.amount;
        }
    }
    
    // Step 2: Build max heaps
    // pair<amount, node_index>
    using HeapEntry = std::pair<double, int>;
    std::priority_queue<HeapEntry> creditor_heap; // positive balances
    std::priority_queue<HeapEntry> debtor_heap;   // negative balances (stored positive)
    
    for (int i = 0; i < num_nodes; i++) {
        if (balances[i] > 0.01) {
            creditor_heap.push({balances[i], i});
        } else if (balances[i] < -0.01) {
            debtor_heap.push({-balances[i], i});
        }
    }
    
    // Step 3: Greedy matching
    while (!creditor_heap.empty() && !debtor_heap.empty()) {
        auto [credit_amt, creditor_id] = creditor_heap.top();
        creditor_heap.pop();
        auto [debt_amt, debtor_id] = debtor_heap.top();
        debtor_heap.pop();
        
        double settle = std::min(credit_amt, debt_amt);
        
        // Round to cents
        settle = std::round(settle * 100.0) / 100.0;
        
        if (settle > 0.01) {
            settlements.push_back({debtor_id, creditor_id, settle});
        }
        
        double new_credit = credit_amt - settle;
        double new_debt = debt_amt - settle;
        
        if (new_credit > 0.01) {
            creditor_heap.push({new_credit, creditor_id});
        }
        if (new_debt > 0.01) {
            debtor_heap.push({new_debt, debtor_id});
        }
    }
    
    return settlements;
}

// ── JSON Serializer ────────────────────────────────────

static std::string settlements_to_json(const std::vector<Settlement>& settlements) {
    std::ostringstream oss;
    oss << "[";
    for (size_t i = 0; i < settlements.size(); i++) {
        if (i > 0) oss << ",";
        oss << "{\"from\":" << settlements[i].from
            << ",\"to\":" << settlements[i].to
            << ",\"amount\":" << std::round(settlements[i].amount * 100.0) / 100.0
            << "}";
    }
    oss << "]";
    return oss.str();
}

// ── Exported WASM Functions ────────────────────────────

static char* last_result = nullptr;

/**
 * Main solver entry point.
 *
 * @param json_input  JSON string: {"edges":[{from,to,amount},...], "numNodes": N}
 * @return            JSON string: [{from,to,amount},...]
 *
 * The caller must free the result via free_result().
 */
extern "C" {

EMSCRIPTEN_KEEPALIVE
const char* solve(const char* json_input) {
    // Free previous result
    if (last_result) {
        free(last_result);
        last_result = nullptr;
    }
    
    // Parse numNodes from input
    int num_nodes = 0;
    const char* nn = strstr(json_input, "\"numNodes\"");
    if (nn) {
        nn = strchr(nn, ':');
        if (nn) {
            nn++;
            while (*nn == ' ' || *nn == '\t') nn++;
            num_nodes = atoi(nn);
        }
    }
    
    // Parse edges array
    const char* edges_start = strstr(json_input, "\"edges\"");
    std::vector<Edge> edges;
    if (edges_start) {
        edges_start = strchr(edges_start, '[');
        if (edges_start) {
            // Find matching ']'
            int depth = 0;
            const char* edges_end = edges_start;
            do {
                if (*edges_end == '[') depth++;
                else if (*edges_end == ']') depth--;
                edges_end++;
            } while (depth > 0 && *edges_end);
            
            std::string edges_json(edges_start, edges_end);
            edges = parse_edges(edges_json.c_str());
        }
    } else {
        // Try parsing the entire input as an edge array
        edges = parse_edges(json_input);
        // Infer num_nodes from edges
        for (const auto& e : edges) {
            num_nodes = std::max(num_nodes, std::max(e.from, e.to) + 1);
        }
    }
    
    // Solve
    auto settlements = solve_debts(edges, num_nodes);
    
    // Serialize
    std::string result = settlements_to_json(settlements);
    
    // Allocate and copy result
    last_result = (char*)malloc(result.size() + 1);
    if (last_result) {
        memcpy(last_result, result.c_str(), result.size() + 1);
    }
    
    return last_result;
}

EMSCRIPTEN_KEEPALIVE
void free_result() {
    if (last_result) {
        free(last_result);
        last_result = nullptr;
    }
}

EMSCRIPTEN_KEEPALIVE
int get_version() {
    return 200; // v2.0.0
}

} // extern "C"

// ── Native Test Main (not compiled for WASM) ───────────

#ifndef __EMSCRIPTEN__
#include <iostream>

int main() {
    // Test 1: Simple 3-person cycle
    {
        const char* input = R"({"edges":[{"from":0,"to":1,"amount":100},{"from":1,"to":2,"amount":100},{"from":2,"to":0,"amount":100}],"numNodes":3})";
        const char* result = solve(input);
        std::cout << "Test 1 (3-person cycle): " << result << std::endl;
        // Expected: [] (all debts cancel out)
    }
    
    // Test 2: Chain debt
    {
        const char* input = R"({"edges":[{"from":0,"to":1,"amount":50},{"from":1,"to":2,"amount":30}],"numNodes":3})";
        const char* result = solve(input);
        std::cout << "Test 2 (chain): " << result << std::endl;
        // Expected: [{from:0,to:2,amount:30},{from:0,to:1,amount:20}]
    }
    
    // Test 3: Single edge
    {
        const char* input = R"({"edges":[{"from":0,"to":1,"amount":75}],"numNodes":2})";
        const char* result = solve(input);
        std::cout << "Test 3 (single): " << result << std::endl;
        // Expected: [{from:0,to:1,amount:75}]
    }
    
    // Test 4: Empty input
    {
        const char* input = R"({"edges":[],"numNodes":0})";
        const char* result = solve(input);
        std::cout << "Test 4 (empty): " << result << std::endl;
        // Expected: []
    }
    
    // Test 5: Complex 5-person graph
    {
        const char* input = R"({"edges":[
            {"from":0,"to":1,"amount":100},
            {"from":1,"to":2,"amount":50},
            {"from":2,"to":3,"amount":75},
            {"from":3,"to":4,"amount":25},
            {"from":4,"to":0,"amount":60},
            {"from":0,"to":3,"amount":40}
        ],"numNodes":5})";
        const char* result = solve(input);
        std::cout << "Test 5 (5-person complex): " << result << std::endl;
    }
    
    free_result();
    return 0;
}
#endif
