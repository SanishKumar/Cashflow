// CashFlow settlement solver, compiled to WebAssembly with Emscripten.
//
// The solver calculates net balances in integer cents. For ordinary groups
// (up to 12 non-zero balances) it exhaustively finds the minimum possible
// number of payments. Larger groups use a deterministic greedy fallback that
// preserves every balance in at most N - 1 payments.

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <limits>
#include <queue>
#include <sstream>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

namespace {

constexpr int EXACT_SOLVER_ACTIVE_BALANCE_LIMIT = 12;

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

// Minimal parser for [{"from":0,"to":1,"amount":100.5}, ...].
static std::vector<Edge> parse_edges(const char* json) {
    std::vector<Edge> edges;
    const char* p = json;

    while (*p && *p != '[') p++;
    if (!*p) return edges;
    p++;

    while (*p) {
        while (*p && *p != '{' && *p != ']') p++;
        if (!*p || *p == ']') break;
        p++;

        Edge edge = {0, 0, 0.0};
        while (*p && *p != '}') {
            while (*p && *p != '"') p++;
            if (!*p) break;
            p++;

            std::string key;
            while (*p && *p != '"') key += *p++;
            if (!*p) break;
            p++;

            while (*p && *p != ':') p++;
            if (!*p) break;
            p++;
            while (*p && (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r')) p++;

            std::string value;
            while (*p && *p != ',' && *p != '}') {
                if (*p != ' ' && *p != '\t' && *p != '\n' && *p != '\r') value += *p;
                p++;
            }

            if (key == "from") edge.from = std::atoi(value.c_str());
            else if (key == "to") edge.to = std::atoi(value.c_str());
            else if (key == "amount") edge.amount = std::atof(value.c_str());
        }

        if (*p == '}') p++;
        edges.push_back(edge);
    }

    return edges;
}

static std::string state_key(const std::vector<long long>& balances) {
    std::ostringstream stream;
    for (const long long balance : balances) stream << balance << ',';
    return stream.str();
}

static void search_exact(
    std::vector<long long>& balances,
    std::vector<Settlement>& current,
    std::vector<Settlement>& best,
    int& best_count,
    std::unordered_map<std::string, int>& seen_depth
) {
    if (static_cast<int>(current.size()) >= best_count) return;

    int index = -1;
    for (int i = 0; i < static_cast<int>(balances.size()); i++) {
        if (balances[i] != 0) {
            index = i;
            break;
        }
    }

    if (index == -1) {
        best = current;
        best_count = static_cast<int>(current.size());
        return;
    }

    const std::string key = state_key(balances);
    const auto prior = seen_depth.find(key);
    if (prior != seen_depth.end() && prior->second <= static_cast<int>(current.size())) return;
    seen_depth[key] = static_cast<int>(current.size());

    const long long source_amount = balances[index];
    std::unordered_set<long long> attempted_counterpart_amounts;

    for (int counterpart = 0; counterpart < static_cast<int>(balances.size()); counterpart++) {
        const long long counterpart_amount = balances[counterpart];
        if (source_amount * counterpart_amount >= 0) continue;
        if (!attempted_counterpart_amounts.insert(counterpart_amount).second) continue;

        const long long cents = std::min(std::llabs(source_amount), std::llabs(counterpart_amount));
        const int from = source_amount < 0 ? index : counterpart;
        const int to = source_amount < 0 ? counterpart : index;

        balances[index] += source_amount < 0 ? cents : -cents;
        balances[counterpart] += counterpart_amount < 0 ? cents : -cents;
        current.push_back({from, to, static_cast<double>(cents) / 100.0});

        search_exact(balances, current, best, best_count, seen_depth);

        current.pop_back();
        balances[index] = source_amount;
        balances[counterpart] = counterpart_amount;
    }
}

static std::vector<Settlement> solve_exactly(std::vector<long long> balances) {
    std::vector<Settlement> current;
    std::vector<Settlement> best;
    std::unordered_map<std::string, int> seen_depth;
    int best_count = std::numeric_limits<int>::max();

    search_exact(balances, current, best, best_count, seen_depth);
    return best;
}

static std::vector<Settlement> solve_greedily(const std::vector<long long>& balances) {
    using HeapEntry = std::pair<long long, int>;
    std::priority_queue<HeapEntry> creditors;
    std::priority_queue<HeapEntry> debtors;
    std::vector<Settlement> settlements;

    for (int i = 0; i < static_cast<int>(balances.size()); i++) {
        if (balances[i] > 0) creditors.push({balances[i], i});
        else if (balances[i] < 0) debtors.push({-balances[i], i});
    }

    while (!creditors.empty() && !debtors.empty()) {
        const auto [credit, creditor] = creditors.top();
        creditors.pop();
        const auto [debt, debtor] = debtors.top();
        debtors.pop();

        const long long cents = std::min(credit, debt);
        settlements.push_back({debtor, creditor, static_cast<double>(cents) / 100.0});

        if (credit > cents) creditors.push({credit - cents, creditor});
        if (debt > cents) debtors.push({debt - cents, debtor});
    }

    return settlements;
}

static std::vector<Settlement> solve_debts(const std::vector<Edge>& edges, int num_nodes) {
    if (edges.empty() || num_nodes <= 0) return {};

    std::vector<long long> balances(num_nodes, 0);
    for (const auto& edge : edges) {
        if (edge.from < 0 || edge.from >= num_nodes || edge.to < 0 || edge.to >= num_nodes) continue;
        const long long cents = std::llround(edge.amount * 100.0);
        balances[edge.from] -= cents;
        balances[edge.to] += cents;
    }

    const int active_balances = static_cast<int>(std::count_if(
        balances.begin(), balances.end(), [](long long balance) { return balance != 0; }
    ));

    if (active_balances <= EXACT_SOLVER_ACTIVE_BALANCE_LIMIT) return solve_exactly(balances);
    return solve_greedily(balances);
}

static std::string settlements_to_json(const std::vector<Settlement>& settlements) {
    std::ostringstream stream;
    stream << "[";
    for (size_t i = 0; i < settlements.size(); i++) {
        if (i > 0) stream << ",";
        stream << "{\"from\":" << settlements[i].from
               << ",\"to\":" << settlements[i].to
               << ",\"amount\":" << std::round(settlements[i].amount * 100.0) / 100.0
               << "}";
    }
    stream << "]";
    return stream.str();
}

static char* last_result = nullptr;

} // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE
const char* solve(const char* json_input) {
    if (last_result) {
        std::free(last_result);
        last_result = nullptr;
    }

    int num_nodes = 0;
    const char* number_of_nodes = std::strstr(json_input, "\"numNodes\"");
    if (number_of_nodes) {
        number_of_nodes = std::strchr(number_of_nodes, ':');
        if (number_of_nodes) {
            number_of_nodes++;
            while (*number_of_nodes == ' ' || *number_of_nodes == '\t') number_of_nodes++;
            num_nodes = std::atoi(number_of_nodes);
        }
    }

    const char* edges_start = std::strstr(json_input, "\"edges\"");
    std::vector<Edge> edges;
    if (edges_start) {
        edges_start = std::strchr(edges_start, '[');
        if (edges_start) {
            int depth = 0;
            const char* edges_end = edges_start;
            do {
                if (*edges_end == '[') depth++;
                else if (*edges_end == ']') depth--;
                edges_end++;
            } while (depth > 0 && *edges_end);

            const std::string edges_json(edges_start, edges_end);
            edges = parse_edges(edges_json.c_str());
        }
    } else {
        edges = parse_edges(json_input);
        for (const auto& edge : edges) num_nodes = std::max(num_nodes, std::max(edge.from, edge.to) + 1);
    }

    const std::string result = settlements_to_json(solve_debts(edges, num_nodes));
    last_result = static_cast<char*>(std::malloc(result.size() + 1));
    if (last_result) std::memcpy(last_result, result.c_str(), result.size() + 1);
    return last_result;
}

EMSCRIPTEN_KEEPALIVE
void free_result() {
    if (last_result) {
        std::free(last_result);
        last_result = nullptr;
    }
}

EMSCRIPTEN_KEEPALIVE
int get_version() {
    return 201; // v2.1.0
}

} // extern "C"

#ifndef __EMSCRIPTEN__
#include <iostream>

int main() {
    const char* input = R"({"edges":[{"from":0,"to":2,"amount":2},{"from":0,"to":3,"amount":5},{"from":1,"to":4,"amount":6}],"numNodes":5})";
    std::cout << solve(input) << std::endl;
    free_result();
    return 0;
}
#endif
